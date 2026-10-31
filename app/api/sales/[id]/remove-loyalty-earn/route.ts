import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { removeLoyaltyEarn } from '@/lib/services/loyalty-reversal';
import { audit } from '@/lib/audit/log';

/**
 * Retire les points fidélité ACQUIS (gagnés) sur une vente validée, sans
 * toucher aux articles, paiements ni facture — voir loyalty-reversal.ts.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.refund');
  if ('response' in g) return g.response;
  try {
    const out = await removeLoyaltyEarn({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      saleId: params.id,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'sales.remove_loyalty_earn',
      entityType: 'sale', entityId: params.id,
      payload: { removed_amount: out.removed_amount },
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'SALE_NOT_FOUND' ? 404 :
      msg === 'SALE_NOT_VALIDATED' ? 409 :
      msg === 'NO_CUSTOMER' ? 422 :
      msg === 'NO_LOYALTY_EARNED' ? 422 :
      msg === 'ALREADY_REMOVED' ? 409 :
      400;
    return jsonError(msg, status);
  }
}
