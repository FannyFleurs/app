import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { SaleCancelService } from '@/lib/services/sale-cancel-service';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  reason: z.string().min(1).max(500),
});

/**
 * Annulation totale d'une vente validée (contre-passation complète : articles,
 * tous les modes de règlement, fidélité). Émet un avoir + événement fiscal
 * SALE_CANCELLED_BY_CREDIT_NOTE. La vente passe en « annulée ».
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.refund');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  try {
    const out = await SaleCancelService.cancelSale({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      saleId: params.id,
      reason: parsed.data.reason,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'sales.cancel_validated',
      entityType: 'credit_note', entityId: out.credit_note_id,
      payload: { sale_id: params.id, credit_note_number: out.number, amount: out.amount },
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'SALE_NOT_FOUND' ? 404 :
      msg === 'SALE_NOT_CANCELABLE' ? 409 :
      msg === 'SALE_INVOICED' ? 409 :
      msg === 'SALE_HAS_RETURNS' ? 409 :
      msg === 'REASON_REQUIRED' ? 422 :
      400;
    return jsonError(msg, status);
  }
}
