import './load-env';
import { pool } from '../lib/db/client';
import { generateEan13 } from '../lib/services/ean';

/**
 * Attribue un EAN-13 interne (préfixe 28) aux packs créés avant que la
 * création d'un pack n'en génère un automatiquement. Sans code-barres, un
 * pack ne peut ni être scanné en caisse, ni avoir d'étiquette imprimée.
 *
 * Idempotent : ne touche que les packs dont barcode est NULL.
 *
 * Usage :
 *   npm run packs:backfill-barcodes            # DRY-RUN : affiche le plan
 *   npm run packs:backfill-barcodes -- --apply # applique réellement
 */

const APPLY = process.argv.includes('--apply');

async function main() {
  const packs = await pool.query<{ id: string; organization_id: string; name: string }>(
    `SELECT id, organization_id, name FROM products
      WHERE COALESCE(is_pack, FALSE) = TRUE AND barcode IS NULL
      ORDER BY organization_id, name`,
  );

  if (packs.rows.length === 0) {
    console.log('✓ Aucun pack à rattraper : tous ont déjà un code-barres.');
    return;
  }

  let n = 0;
  for (const pack of packs.rows) {
    let code: string | null = null;
    for (let i = 0; i < 5; i++) {
      const candidate = generateEan13('28');
      const exists = await pool.query(
        `SELECT 1 FROM products WHERE organization_id = $1 AND barcode = $2`,
        [pack.organization_id, candidate],
      );
      if (exists.rowCount === 0) { code = candidate; break; }
    }
    if (!code) {
      console.log(`✗ ${pack.name} (${pack.id}) : génération du code-barres échouée, ignoré.`);
      continue;
    }
    console.log(`• ${pack.name} → ${code}`);
    if (APPLY) {
      await pool.query(`UPDATE products SET barcode = $1 WHERE id = $2`, [code, pack.id]);
    }
    n++;
  }

  console.log('');
  console.log(`${APPLY ? '✓ Appliqué' : '[DRY-RUN]'} : ${n} pack(s) rattrapé(s).`);
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
