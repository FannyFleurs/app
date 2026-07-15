import './load-env';
import { pool } from '../lib/db/client';
import { STOCK_TRACKED_SQL } from '../lib/services/stock-tracking';

/**
 * Rattrapage de l'historique de stock des ventes passées.
 *
 * Avant le correctif « tracer chaque vente dans l'historique article », les
 * produits non suivis en stock (track_stock=false) ne généraient AUCUN
 * mouvement à la vente. Ce script recrée les mouvements de vente manquants
 * pour les produits désormais suivis (cf. stock-tracking.ts : EAN présent +
 * hors catégorie « Livraison »), afin qu'ils apparaissent dans l'historique.
 *
 * Règles :
 *   - Ventes concernées : status = 'validated' (les ventes entièrement
 *     annulées par avoir sont exclues d'office : status différent).
 *   - Quantité rattrapée = quantité vendue − quantité déjà retournée (avoirs),
 *     pour ne pas décrémenter en trop une vente partiellement retournée. Une
 *     ligne entièrement retournée est ignorée (net = 0).
 *   - Idempotent : une ligne qui a déjà un mouvement 'sale' est ignorée.
 *   - Les niveaux de stock (stock_levels) sont corrigés en conséquence : un
 *     produit sans stock informatique peut passer en négatif.
 *
 * Nota : les mouvements rattrapés portent la DATE réelle de la vente et le bon
 * delta ; en revanche le « stock après » (new_quantity) est reconstruit en
 * empilant sur le stock actuel (on ne rejoue pas tout l'historique), c'est donc
 * une valeur cohérente mais pas le solde exact à l'instant passé. Les retours
 * passés ne sont PAS recréés comme entrées séparées (seule la vente nette est
 * rattrapée) ; les retours futurs sont tracés en direct.
 *
 * Usage :
 *   npm run stock:backfill            # DRY-RUN : n'écrit rien, affiche le plan
 *   npm run stock:backfill -- --apply # applique réellement
 */

const APPLY = process.argv.includes('--apply');
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface MissingLine {
  sale_id: string; organization_id: string; store_id: string; user_id: string;
  ts: string; receipt_number: string | null;
  product_id: string; variant_id: string | null; line_index: number;
  quantity: number;
}

async function main() {
  // 1. Lignes de vente à rattraper (produit suivi, vente validée, sans
  //    mouvement 'sale' existant).
  const missingRes = await pool.query<MissingLine>(
    `SELECT s.id AS sale_id, s.organization_id, s.store_id, s.user_id,
            COALESCE(s.occurred_at, s.validated_at, s.created_at) AS ts,
            s.receipt_number,
            sl.product_id, sl.variant_id, sl.line_index,
            sl.quantity::float8 AS quantity
       FROM sales s
       JOIN sale_lines sl ON sl.sale_id = s.id
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE s.status = 'validated'
        AND sl.product_id IS NOT NULL
        AND ${STOCK_TRACKED_SQL}
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements m
           WHERE m.source_type = 'sale' AND m.source_id = s.id
             AND m.product_id = sl.product_id
             AND m.variant_id IS NOT DISTINCT FROM sl.variant_id
        )
      ORDER BY s.store_id, sl.product_id, sl.variant_id,
               COALESCE(s.occurred_at, s.validated_at, s.created_at), s.id`,
  );

  if (missingRes.rows.length === 0) {
    console.log('✓ Aucune vente à rattraper : l\'historique est déjà complet.');
    return;
  }

  // 2. Quantités déjà retournées par (vente, ligne), depuis les avoirs.
  const returnedRes = await pool.query<{ sale_id: string; line_index: number; qty: string }>(
    `SELECT (fe.payload->>'origin_sale_id') AS sale_id,
            (l->>'line_index')::int AS line_index,
            SUM((l->>'quantity')::numeric) AS qty
       FROM fiscal_events fe
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(fe.payload->'lines', '[]'::jsonb)) AS l
      WHERE fe.entity_type = 'credit_note'
        AND fe.payload ? 'origin_sale_id'
      GROUP BY 1, 2`,
  );
  const returned = new Map<string, number>();
  for (const r of returnedRes.rows) {
    returned.set(`${r.sale_id}|${r.line_index}`, Number(r.qty));
  }

  // 3. Groupe par (boutique, produit, variant).
  const groups = new Map<string, MissingLine[]>();
  for (const l of missingRes.rows) {
    const key = `${l.store_id}|${l.product_id}|${l.variant_id ?? 'null'}`;
    const arr = groups.get(key);
    if (arr) arr.push(l); else groups.set(key, [l]);
  }

  let totalMovements = 0;
  let totalGroups = 0;
  const client = await pool.connect();
  try {
    for (const [, lines] of groups) {
      const { store_id, product_id, variant_id, organization_id } = lines[0]!;

      // Nom de l'article + stock actuel (pour le log et le point de départ).
      const info = await client.query<{ name: string; q: number | null; level_id: string | null }>(
        `SELECT p.name,
                sl.quantity::float8 AS q, sl.id AS level_id
           FROM products p
           LEFT JOIN stock_levels sl
             ON sl.store_id = $2 AND sl.product_id = p.id
            AND sl.variant_id IS NOT DISTINCT FROM $3
          WHERE p.id = $1`,
        [product_id, store_id, variant_id],
      );
      const name = info.rows[0]?.name ?? product_id;
      const levelId = info.rows[0]?.level_id ?? null;
      const curLevel = info.rows[0]?.q ?? 0;

      // Prépare les mouvements nets (vendu − déjà retourné), en chronologie.
      const toInsert: Array<{ line: MissingLine; net: number; prev: number; next: number }> = [];
      let running = curLevel;
      for (const line of lines) {
        const ret = returned.get(`${line.sale_id}|${line.line_index}`) ?? 0;
        const net = round3(line.quantity - ret);
        if (net <= 0.0001) continue; // ligne entièrement retournée : rien à tracer
        const prev = round3(running);
        running = round3(running - net);
        toInsert.push({ line, net, prev, next: running });
      }
      if (toInsert.length === 0) continue;

      totalGroups++;
      totalMovements += toInsert.length;
      const flag = running < 0 ? '  ⚠ stock négatif' : '';
      console.log(
        `• ${name} — ${toInsert.length} vente(s) · stock ${curLevel} → ${running}${flag}`,
      );

      if (APPLY) {
        await client.query('BEGIN');
        try {
          for (const ins of toInsert) {
            const l = ins.line;
            await client.query(
              `INSERT INTO stock_movements
                 (organization_id, store_id, product_id, variant_id,
                  movement_type, quantity_delta, previous_quantity, new_quantity,
                  reason, source_type, source_id, user_id, created_at)
               VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,$8,'sale',$9,$10,$11)`,
              [
                l.organization_id, store_id, product_id, variant_id,
                -ins.net, ins.prev, ins.next,
                `Vente ticket ${l.receipt_number ?? '?'} (rattrapage stock)`,
                l.sale_id, l.user_id, new Date(l.ts),
              ],
            );
          }
          if (levelId) {
            await client.query(
              `UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE id = $2`,
              [running, levelId],
            );
          } else {
            await client.query(
              `INSERT INTO stock_levels (organization_id, store_id, product_id, variant_id, quantity)
               VALUES ($1,$2,$3,$4,$5)`,
              [organization_id, store_id, product_id, variant_id, running],
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      }
    }
  } finally {
    client.release();
  }

  console.log('');
  console.log(
    `${APPLY ? '✓ Appliqué' : '[DRY-RUN]'} : ${totalMovements} mouvement(s) de vente ` +
    `sur ${totalGroups} couple(s) article/boutique.`,
  );
  if (!APPLY) {
    console.log('→ Relancez avec « -- --apply » pour écrire réellement en base.');
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Erreur backfill :', err);
    return pool.end().finally(() => process.exit(1));
  });
