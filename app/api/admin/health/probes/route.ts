import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Ce module n'est évalué qu'une fois par instance de lambda : `served`
 * compte les requêtes servies par CETTE instance. Combiné à l'âge du
 * process, il dit si la requête a payé un démarrage à froid.
 */
let served = 0;

interface Probe {
  key: string;
  label: string;
  hint: string;
  /** Seuil (ms) au-delà duquel la mesure est signalée comme lente. */
  warn: number;
  run: (orgId: string) => Promise<number>;
}

/** Chaque sonde renvoie le nombre de lignes lues (indicatif). */
const PROBES: Probe[] = [
  {
    key: 'session',
    label: 'Vérification de session',
    hint: 'Jouée à chaque requête authentifiée : son coût est payé partout.',
    warn: 15,
    run: async () => {
      const r = await query(
        `SELECT s.revoked_at, s.expires_at, s.kind, u.is_active
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.id = $1 AND s.token_hash = $2`,
        ['00000000-0000-0000-0000-000000000000', 'probe'],
      );
      return r.rowCount;
    },
  },
  {
    key: 'barcode',
    label: 'Scan code-barres',
    hint: 'Recherche d’un article par code-barres à la caisse.',
    warn: 20,
    run: async (orgId) => {
      const r = await query(
        `SELECT id, name, sale_price_ttc
           FROM products
          WHERE organization_id = $1 AND barcode = $2
          LIMIT 1`,
        [orgId, '__sonde__'],
      );
      return r.rowCount;
    },
  },
  {
    key: 'catalog',
    label: 'Chargement du catalogue',
    hint: 'Liste complète des articles (ouverture de la caisse / page Articles).',
    warn: 300,
    run: async (orgId) => {
      const r = await query(
        `SELECT p.id, p.name, p.sku, p.barcode, p.sale_price_ttc,
                p.category_id, p.is_active, p.visible_in_pos,
                t.rate AS tax_rate, c.name AS category_name
           FROM products p
           JOIN tax_rates t ON t.id = p.tax_rate_id
           LEFT JOIN product_categories c ON c.id = p.category_id
          WHERE p.organization_id = $1
          ORDER BY p.name ASC
          LIMIT 20000`,
        [orgId],
      );
      return r.rowCount;
    },
  },
  {
    key: 'customer_search',
    label: 'Recherche client',
    hint: 'Recherche par nom / téléphone depuis la caisse.',
    warn: 80,
    run: async (orgId) => {
      const r = await query(
        `SELECT id, first_name, last_name, company_name, phone
           FROM customers
          WHERE organization_id = $1 AND is_anonymized = FALSE
            AND (
              lower(COALESCE(company_name,'')) LIKE $2
              OR lower(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) LIKE $2
              OR lower(COALESCE(email,'')) LIKE $2
              OR COALESCE(phone,'') = $3
            )
          ORDER BY created_at DESC
          LIMIT 50`,
        [orgId, '%mar%', 'mar'],
      );
      return r.rowCount;
    },
  },
  {
    key: 'day_sales',
    label: 'Ventes du jour',
    hint: 'Agrégat utilisé par Ma journée, le X et le tableau de bord.',
    warn: 120,
    run: async (orgId) => {
      const r = await query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(total_ttc), 0)::text AS ttc
           FROM sales
          WHERE organization_id = $1
            AND status = 'validated'
            AND validated_at::date = (now() AT TIME ZONE 'Europe/Paris')::date`,
        [orgId],
      );
      return r.rowCount;
    },
  },
  {
    key: 'sale_lines',
    label: 'Lignes d’un ticket',
    hint: 'Relecture des lignes de la dernière vente (réimpression, détail).',
    warn: 60,
    run: async (orgId) => {
      const r = await query(
        `SELECT sl.id, sl.product_id, sl.quantity, sl.line_ttc
           FROM sale_lines sl
          WHERE sl.sale_id = (
                SELECT id FROM sales
                 WHERE organization_id = $1 AND status = 'validated'
                 ORDER BY validated_at DESC
                 LIMIT 1
          )`,
        [orgId],
      );
      return r.rowCount;
    },
  },
];

/**
 * Chronomètre les requêtes réellement jouées par la caisse, côté serveur.
 * Objectif : distinguer un problème de réseau (latence client -> Vercel) d'un
 * problème de requête SQL (index manquant, volume) ou de démarrage à froid.
 *
 * Toutes les sondes sont en LECTURE SEULE et bornées à l'organisation de
 * l'utilisateur connecté.
 */
export async function GET() {
  // Âge du process Node : quelques secondes = la lambda vient de démarrer,
  // donc cette requête a payé le démarrage à froid.
  const uptime = process.uptime();
  const coldStart = served === 0 && uptime < 10;
  served++;

  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const orgId = g.user.organizationId;

  const t0 = performance.now();
  const results = [];
  for (const p of PROBES) {
    const s = performance.now();
    try {
      const rows = await p.run(orgId);
      results.push({
        key: p.key, label: p.label, hint: p.hint, warn: p.warn,
        ms: Math.round((performance.now() - s) * 10) / 10,
        rows,
        ok: true,
      });
    } catch {
      // Une sonde en échec (table absente sur un ancien schéma) ne doit pas
      // faire tomber toute la mesure.
      results.push({
        key: p.key, label: p.label, hint: p.hint, warn: p.warn,
        ms: null, rows: null, ok: false,
      });
    }
  }

  return NextResponse.json({
    probes: results,
    total_ms: Math.round((performance.now() - t0) * 10) / 10,
    instance: {
      cold_start: coldStart,
      // Âge de l'instance : s'il repart de ~0 à chaque mesure, les lambdas
      // sont recyclées en permanence → démarrages à froid fréquents.
      age_s: Math.round(uptime),
      served,
    },
  });
}
