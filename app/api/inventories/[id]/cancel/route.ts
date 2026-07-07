import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  const r = await query(
    `UPDATE inventories SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND organization_id = $2
        AND status IN ('in_progress', 'in_review')`,
    [params.id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('INVENTORY_LOCKED', 409);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'inventory.cancel', entityType: 'inventory', entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
