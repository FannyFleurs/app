import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Région déclarée dans vercel.json (`"regions": ["fra1"]`). Sert de référence
 * pour détecter un écart avec la région RÉELLE d'exécution (le réglage
 * Vercel « Functions Region » du dashboard peut passer devant).
 */
const EXPECTED_REGION = 'fra1';

/** Régions Vercel -> ville + région cloud équivalente (pour la co-localisation). */
const VERCEL_REGIONS: Record<string, { city: string; cloud: string }> = {
  arn1: { city: 'Stockholm',       cloud: 'eu-north-1' },
  bom1: { city: 'Mumbai',          cloud: 'ap-south-1' },
  cdg1: { city: 'Paris',           cloud: 'eu-west-3' },
  cle1: { city: 'Cleveland (US)',  cloud: 'us-east-2' },
  cpt1: { city: 'Le Cap',          cloud: 'af-south-1' },
  dub1: { city: 'Dublin',          cloud: 'eu-west-1' },
  fra1: { city: 'Francfort',       cloud: 'eu-central-1' },
  gru1: { city: 'São Paulo',       cloud: 'sa-east-1' },
  hkg1: { city: 'Hong Kong',       cloud: 'ap-east-1' },
  hnd1: { city: 'Tokyo',           cloud: 'ap-northeast-1' },
  iad1: { city: 'Washington (US)', cloud: 'us-east-1' },
  icn1: { city: 'Séoul',           cloud: 'ap-northeast-2' },
  kix1: { city: 'Osaka',           cloud: 'ap-northeast-3' },
  lhr1: { city: 'Londres',         cloud: 'eu-west-2' },
  pdx1: { city: 'Portland (US)',   cloud: 'us-west-2' },
  sfo1: { city: 'San Francisco',   cloud: 'us-west-1' },
  sin1: { city: 'Singapour',       cloud: 'ap-southeast-1' },
  syd1: { city: 'Sydney',          cloud: 'ap-southeast-2' },
};

/** Régions cloud -> ville lisible (côté base de données). */
const CLOUD_CITIES: Record<string, string> = {
  'eu-central-1':   'Francfort',
  'eu-west-1':      'Dublin',
  'eu-west-2':      'Londres',
  'eu-west-3':      'Paris',
  'eu-north-1':     'Stockholm',
  'us-east-1':      'Virginie (US)',
  'us-east-2':      'Ohio (US)',
  'us-west-1':      'Californie (US)',
  'us-west-2':      'Oregon (US)',
  'ap-south-1':     'Mumbai',
  'ap-southeast-1': 'Singapour',
  'ap-southeast-2': 'Sydney',
  'ap-northeast-1': 'Tokyo',
  'sa-east-1':      'São Paulo',
};

/**
 * Extrait la région cloud du host Postgres.
 * Neon : ep-xxx-123456.eu-central-1.aws.neon.tech (ou …-pooler.eu-central-1.…)
 */
function dbCloudRegion(host: string): string | null {
  const m = host.match(/\.([a-z]{2}-[a-z]+-\d)\./);
  return m?.[1] ?? null;
}

/**
 * Santé & quota de la plateforme (super_admin) : taille de la base,
 * volumétrie (tickets, clients…), plus grosses tables, latence + région
 * d'exécution, et vérification que la connexion utilise bien le pooler
 * (PgBouncer) — critique en serverless.
 */
export async function GET() {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  // --- Connexion : pooler ? (on ne renvoie JAMAIS l'URL complète) ---
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try { host = new URL(url).host; } catch { /* url absente/incorrecte */ }
  const pooled = /-pooler\.|pooler\.|pgbouncer/i.test(url);
  const sslmode = /sslmode=require|ssl=true/i.test(url);
  // Masque le host : on garde juste le suffixe (région/provider), pas l'ID.
  const hostMasked = host ? host.replace(/^[^.]+/, '***') : '';

  const out: Record<string, unknown> = {
    connection: { host_masked: hostMasked, pooled, ssl: sslmode },
  };

  // --- Région d'exécution vs région de la base ---
  // VERCEL_REGION = région RÉELLE de la lambda (peut différer de vercel.json
  // si le dashboard « Functions Region » impose autre chose). En local, absent.
  const fnCode = process.env.VERCEL_REGION || null;
  const fnInfo = fnCode ? VERCEL_REGIONS[fnCode] ?? null : null;
  const dbCloud = dbCloudRegion(host);
  out.region = {
    expected: EXPECTED_REGION,
    expected_city: VERCEL_REGIONS[EXPECTED_REGION]?.city ?? EXPECTED_REGION,
    function: fnCode,
    function_city: fnInfo?.city ?? null,
    function_cloud: fnInfo?.cloud ?? null,
    database: dbCloud,
    database_city: dbCloud ? CLOUD_CITIES[dbCloud] ?? dbCloud : null,
    // null = indéterminable (local, ou région inconnue au mapping)
    colocated: fnInfo && dbCloud ? fnInfo.cloud === dbCloud : null,
    matches_config: fnCode ? fnCode === EXPECTED_REGION : null,
  };

  // --- Latence aller-retour vers la base ---
  // 1 requête de chauffe (établissement de connexion) puis 5 mesures :
  // on garde le min (RTT réseau pur) et la médiane (ressenti réel).
  try {
    await query(`SELECT 1`);
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await query(`SELECT 1`);
      samples.push(performance.now() - t0);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    out.latency = {
      min_ms: Math.round((sorted[0] ?? 0) * 10) / 10,
      median_ms: Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) * 10) / 10,
      samples: sorted.map((s) => Math.round(s * 10) / 10),
    };
  } catch { out.latency = null; }

  // --- Row-Level Security ---
  let rlsTables = 0;
  try {
    const r = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity`,
    );
    rlsTables = Number(r.rows[0]?.c ?? 0);
  } catch { /* pré-0036 */ }
  out.rls = { enforced: process.env.RLS_ENFORCE === '1', tables: rlsTables };

  // --- Version Postgres ---
  // `SHOW server_version` renvoie une colonne « server_version » (l'alias
  // n'est pas supporté) ; on passe par current_setting() qui accepte un
  // alias et fonctionne à travers PgBouncer.
  try {
    const v = await query<{ v: string }>(`SELECT current_setting('server_version') AS v`);
    out.postgres_version = v.rows[0]?.v ?? null;
  } catch { out.postgres_version = null; }

  // --- Taille de la base ---
  try {
    const s = await query<{ bytes: string; pretty: string }>(
      `SELECT pg_database_size(current_database())::text AS bytes,
              pg_size_pretty(pg_database_size(current_database())) AS pretty`,
    );
    out.db_bytes = Number(s.rows[0]?.bytes ?? 0);
    out.db_pretty = s.rows[0]?.pretty ?? '—';
  } catch { out.db_bytes = 0; out.db_pretty = '—'; }

  // --- Volumétrie métier (COUNTs tolérants) ---
  async function count(sql: string): Promise<number> {
    try { const r = await query<{ c: string }>(sql); return Number(r.rows[0]?.c ?? 0); }
    catch { return 0; }
  }
  out.counts = {
    organizations: await count(`SELECT COUNT(*)::text AS c FROM organizations`),
    stores:        await count(`SELECT COUNT(*)::text AS c FROM stores`),
    users:         await count(`SELECT COUNT(*)::text AS c FROM users`),
    customers:     await count(`SELECT COUNT(*)::text AS c FROM customers`),
    products:      await count(`SELECT COUNT(*)::text AS c FROM products`),
    tickets:       await count(`SELECT COUNT(*)::text AS c FROM sales WHERE status = 'validated'`),
    receipts:      await count(`SELECT COUNT(*)::text AS c FROM receipts`),
    invoices:      await count(`SELECT COUNT(*)::text AS c FROM invoices`),
  };

  // --- Poids RÉEL d'un ticket ---
  // On ne divise PAS la base entière par le nb de tickets (elle contient
  // une grosse part FIXE : catalogue, config, système…). On mesure la
  // taille moyenne du snapshot d'un reçu + une marge pour les lignes /
  // paiements / événement fiscal associés. Défaut ~4 Ko si pas de reçus.
  let avgTicket = 4096;
  try {
    const a = await query<{ avg: string | null }>(
      `SELECT AVG(pg_column_size(snapshot))::text AS avg FROM receipts`,
    );
    const snap = Number(a.rows[0]?.avg ?? 0);
    if (snap > 0) avgTicket = Math.round(snap + 1500);
  } catch { /* défaut */ }
  out.avg_ticket_bytes = avgTicket;

  // --- Plus grosses tables ---
  try {
    const t = await query<{ name: string; bytes: string; pretty: string }>(
      `SELECT c.relname AS name,
              pg_total_relation_size(c.oid)::text AS bytes,
              pg_size_pretty(pg_total_relation_size(c.oid)) AS pretty
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 12`,
    );
    out.top_tables = t.rows.map((r) => ({ name: r.name, bytes: Number(r.bytes), pretty: r.pretty }));
  } catch { out.top_tables = []; }

  return NextResponse.json(out);
}
