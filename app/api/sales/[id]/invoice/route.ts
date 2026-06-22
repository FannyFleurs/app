import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { InvoiceService } from '@/lib/services/invoice-service';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  customer_id: z.string().uuid().optional(),
  payment_terms: z.string().max(500).optional(),
}).optional();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('invoices.create');
  if ('response' in g) return g.response;

  let body: { customer_id?: string; payment_terms?: string } = {};
  if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
    const parsed = await parseJson(req, schema);
    if ('response' in parsed) return parsed.response;
    body = parsed.data ?? {};
  }

  try {
    const out = await InvoiceService.createFromSale({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      saleId: params.id,
      customerId: body.customer_id,
      paymentTerms: body.payment_terms,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'invoices.create_from_sale',
      entityType: 'invoice', entityId: out.invoice_id,
      payload: { sale_id: params.id, number: out.number },
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'INVOICE_ALREADY_EXISTS' ? 409 :
      msg === 'CUSTOMER_REQUIRED' ? 400 :
      msg === 'SALE_NOT_FOUND' ? 404 :
      msg === 'SALE_NOT_VALIDATED' ? 409 : 400;
    return jsonError(msg, status);
  }
}
