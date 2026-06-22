import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export async function GET(_req: Request, { params }: { params: { saleId: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM receipts WHERE sale_id = $1 AND organization_id = $2`,
    [params.saleId, g.user.organizationId],
  );
  if (rows.length === 0) return jsonError('NOT_FOUND', 404);
  return NextResponse.redirect(new URL(`/api/receipts/${rows[0]!.id}/pdf`, _req.url));
}
