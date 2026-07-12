import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Santé & quota de la plateforme (super_admin) : taille de la base,
 * volumétrie (tickets, clients…), plus grosses tables, et vérification que
 * la connexion utilise bien le pooler (PgBouncer) — critique en serverless.
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
