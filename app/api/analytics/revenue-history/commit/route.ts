import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { audit } from '@/lib/audit/log';
import { parseRevenueImport } from '@/lib/analytics/revenue-history-parse';
import { validateRevenueRows, normStoreName } from '@/lib/analytics/revenue-history-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMPORT = 20000;

/**
 * Insère (upsert) un import d'historique de CA. Seules les lignes SANS erreur
 * sont écrites. La clé (organisation, boutique, jour) est unique : réimporter
 * une même date écrase la valeur précédente.
 */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ imported: 0, skipped: 0 });

  const storesRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores WHERE organization_id = $1 AND is_active = TRUE`,
    [g.user.organizationId],
  );
  const storesByName = new Map(storesRes.rows.map((s) => [normStoreName(s.name), s.id]));

  const raw = await parseRevenueImport(buf);
  const limited = raw.length > MAX_IMPORT ? raw.slice(0, MAX_IMPORT) : raw;
  const today = new Date().toISOString().slice(0, 10);
  const validated = validateRevenueRows(limited, storesByName, today);

  const ok = validated.filter((r) => r.errors.length === 0 && r.store_id);
  const skipped = validated.length - ok.length;

  if (ok.length === 0) return NextResponse.json({ imported: 0, skipped });

  await withTransaction(async (client) => {
    for (const r of ok) {
      await client.query(
        `INSERT INTO revenue_history
           (organization_id, store_id, day, ca_ttc, ca_ht, tickets, source, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'import', $7)
         ON CONFLICT (organization_id, store_id, day) DO UPDATE
           SET ca_ttc = EXCLUDED.ca_ttc,
               ca_ht = EXCLUDED.ca_ht,
               tickets = EXCLUDED.tickets,
               source = 'import',
               updated_at = now(),
               created_by = EXCLUDED.created_by`,
        [g.user.organizationId, r.store_id, r.day, r.ca_ttc, r.ca_ht, r.tickets, g.user.id],
      );
    }
  });

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'revenue_history.import', entityType: 'revenue_history', entityId: null,
    payload: { imported: ok.length, skipped },
  });

  return NextResponse.json({ imported: ok.length, skipped });
}
