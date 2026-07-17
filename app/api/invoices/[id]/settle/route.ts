import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { InvoiceService } from '@/lib/services/invoice-service';

const schema = z.object({
  amount: z.number().positive(),
  method: z.string().max(40).optional(),
});

const ERR: Record<string, { status: number; message: string }> = {
  INVOICE_NOT_FOUND: { status: 404, message: 'Facture introuvable.' },
  INVOICE_ALREADY_PAID: { status: 409, message: 'Facture déjà réglée.' },
  INVOICE_CANCELLED: { status: 409, message: 'Facture annulée.' },
  INVALID_AMOUNT: { status: 400, message: 'Montant invalide.' },
};

/**
 * Solde une facture « en compte » : la passe en « payée » et crédite le solde
 * en compte du client du montant réglé.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('invoices.create');
  if ('response' in g) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const out = await InvoiceService.settleInvoice({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      invoiceId: params.id,
      amount: parsed.data.amount,
      method: parsed.data.method,
    });
    return NextResponse.json(out);
  } catch (e) {
    const code = (e as Error).message;
    const mapped = ERR[code];
    if (mapped) return NextResponse.json({ error: code, message: mapped.message }, { status: mapped.status });
    // eslint-disable-next-line no-console
    console.error('[invoices.settle] échec :', e);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
