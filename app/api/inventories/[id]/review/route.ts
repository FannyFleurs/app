import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Passe l'inventaire de "in_progress" a "in_review".
 * A ce stade on n'ecrit pas encore de mouvements de stock — on ne fait
 * que geler la phase de comptage. La revue affiche uniquement les
 * ecarts pour pointage manuel avant validation finale.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  const r = await query(
    `UPDATE inventories SET status = 'in_review', updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'in_progress'`,
    [params.id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('INVENTORY_NOT_IN_PROGRESS', 409);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'inventory.review', entityType: 'inventory', entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
