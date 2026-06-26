import { NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { audit } from '@/lib/audit/log';

/**
 * Supprime un panier en cours / en attente (jamais validé → aucun impact fiscal).
 * Le trigger fn_protect_validated_sale empêche la suppression d'une vente validée
 * ou annulée par avoir.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  await withTransaction(async (client) => {
    const cur = await client.query<{ status: string }>(
      `SELECT status FROM sales
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [params.id, g.user.organizationId],
    );
    if (cur.rowCount === 0) {
      throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    }
    const status = cur.rows[0]!.status;
    if (status !== 'draft' && status !== 'on_hold') {
      throw Object.assign(new Error('SALE_NOT_CANCELABLE'), { status: 409 });
    }
    // sale_lines & payments cascade via ON DELETE CASCADE
    await client.query(
      `DELETE FROM sales WHERE id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId],
    );
  });

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'sales.cancel_draft',
    entityType: 'sale',
    entityId: params.id,
    payload: {},
  });

  return NextResponse.json({ ok: true });
}
