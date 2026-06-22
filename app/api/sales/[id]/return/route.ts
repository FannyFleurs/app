import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { ReturnService } from '@/lib/services/return-service';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  lines: z.array(z.object({
    line_index: z.number().int().nonnegative(),
    quantity: z.number().positive(),
  })).min(1),
  reason: z.string().min(1).max(500),
  refund_method: z.enum(['credit_note', 'cash']),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.refund');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  try {
    const out = await ReturnService.createCreditNote({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      saleId: params.id,
      lines: parsed.data.lines,
      reason: parsed.data.reason,
      refundMethod: parsed.data.refund_method,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'sales.return',
      entityType: 'credit_note', entityId: out.credit_note_id,
      payload: {
        sale_id: params.id,
        credit_note_number: out.number,
        amount: out.amount,
        refund_method: parsed.data.refund_method,
        is_full_return: out.is_full_return,
      },
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'SALE_NOT_FOUND' ? 404 :
      msg === 'SALE_NOT_REFUNDABLE' ? 409 :
      msg.startsWith('QUANTITY_EXCEEDS') ? 422 :
      msg.startsWith('LINE_NOT_FOUND') ? 422 :
      msg === 'NOTHING_TO_REFUND' || msg === 'NO_LINES' || msg === 'REASON_REQUIRED' ? 422 :
      400;
    return jsonError(msg, status);
  }
}
