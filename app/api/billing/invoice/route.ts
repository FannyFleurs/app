import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { InvoiceService } from '@/lib/services/invoice-service';

const schema = z.object({
  customer_id: z.string().uuid(),
  sale_ids: z.array(z.string().uuid()).min(1),
  due_days: z.number().int().min(0).max(365).optional(),
});

const ERR: Record<string, { status: number; message: string }> = {
  NO_SALES: { status: 400, message: 'Aucun ticket à facturer.' },
  SALE_NOT_VALIDATED: { status: 400, message: 'Un ticket n’est pas validé.' },
  CUSTOMER_MISMATCH: { status: 400, message: 'Un ticket appartient à un autre client.' },
  SALE_ALREADY_INVOICED: { status: 409, message: 'Un ticket est déjà facturé.' },
};

/**
 * Facture de période « en compte » : regroupe des tickets validés d'un client
 * en une facture unique non soldée.
 */
export async function POST(req: Request) {
  const g = await requirePermission('invoices.create');
  if ('response' in g) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const out = await InvoiceService.createFromAccountSales({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      customerId: parsed.data.customer_id,
      saleIds: parsed.data.sale_ids,
      dueDays: parsed.data.due_days,
    });
    return NextResponse.json(out);
  } catch (e) {
    const code = (e as Error).message;
    const mapped = ERR[code];
    if (mapped) return NextResponse.json({ error: code, message: mapped.message }, { status: mapped.status });
    // eslint-disable-next-line no-console
    console.error('[billing.invoice] échec :', e);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
