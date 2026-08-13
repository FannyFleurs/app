import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('fiscal.export');
  if ('response' in g) return g.response;

  const { rows } = await query<{
    file_path: string; format: string; period_start: string; period_end: string;
  }>(
    `SELECT file_path, format, period_start::text, period_end::text
       FROM accounting_exports
      WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (rows.length === 0) return jsonError('NOT_FOUND', 404);
  const e = rows[0]!;

  // file_path stocké en data URL
  const match = /^data:([^;]+);base64,(.+)$/.exec(e.file_path);
  if (!match) return jsonError('INVALID_PAYLOAD', 500);
  const mime = match[1]!;
  const buf = Buffer.from(match[2]!, 'base64');
  const ext = mime.includes('spreadsheetml') ? 'xlsx'
    : mime.includes('json') ? 'json'
    : (e.format === 'fec_like' ? 'txt' : 'csv');
  const filename = `export-${e.format}-${e.period_start}_${e.period_end}.${ext}`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
