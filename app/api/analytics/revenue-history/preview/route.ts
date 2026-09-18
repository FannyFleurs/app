import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseRevenueImport } from '@/lib/analytics/revenue-history-parse';
import { validateRevenueRows, normStoreName } from '@/lib/analytics/revenue-history-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMPORT = 20000;

/** Parse + valide un fichier d'historique de CA SANS l'insérer (prévisualisation). */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ rows: [], errors: 0, total: 0 });

  const storesRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores WHERE organization_id = $1 AND is_active = TRUE`,
    [g.user.organizationId],
  );
  const storesByName = new Map(storesRes.rows.map((s) => [normStoreName(s.name), s.id]));

  const raw = await parseRevenueImport(buf);
  const truncated = raw.length > MAX_IMPORT;
  const limited = truncated ? raw.slice(0, MAX_IMPORT) : raw;

  const today = new Date().toISOString().slice(0, 10);
  const rows = validateRevenueRows(limited, storesByName, today);
  const errors = rows.filter((r) => r.errors.length > 0).length;

  return NextResponse.json({ rows, errors, total: rows.length, truncated });
}
