import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';
import { audit } from '@/lib/audit/log';

const paymentSchema = z.object({
  method: z.enum(['cash','card','check','transfer','gift_card','credit_note','deferred','other']),
  amount: z.number().positive(),
  given_amount: z.number().min(0).optional(),
  reference: z.string().max(80).optional(),
});

const schema = z.object({
  payments: z.array(paymentSchema).min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  try {
    const out = await SaleService.validate({
      saleId: params.id,
      organizationId: g.user.organizationId,
      userId: g.user.id,
      payments: parsed.data.payments,
    });
    await audit({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      action: 'sales.validate',
      entityType: 'sale',
      entityId: params.id,
      payload: { receipt_number: out.receiptNumber },
    });
    return NextResponse.json({
      sale_id: out.saleId,
      receipt_number: out.receiptNumber,
      receipt_id: out.receiptId,
      fiscal_hash: out.fiscalHash,
      fiscal_event_id: out.fiscalEventId,
    });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'PAYMENTS_MISMATCH' ? 422 :
      msg === 'SALE_ALREADY_VALIDATED' ? 409 :
      msg === 'SALE_NOT_FOUND' ? 404 :
      msg === 'SALE_EMPTY' ? 422 : 400;
    return jsonError(msg, status);
  }
}
