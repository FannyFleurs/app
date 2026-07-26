import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { InvoiceService } from '@/lib/services/invoice-service';

const schema = z.object({
  amount: z.number().positive(),
  method: z.string().max(40).optional(),
  store_id: z.string().uuid().optional(),
});

const ERR: Record<string, { status: number; message: string }> = {
  CUSTOMER_NOT_FOUND: { status: 404, message: 'Client introuvable.' },
  INVALID_AMOUNT: { status: 400, message: 'Montant invalide.' },
  NO_OPEN_SESSION: {
    status: 409,
    message: 'Aucune caisse ouverte : ouvrez la caisse avant d’encaisser un règlement en espèces (ou choisissez un autre mode de règlement).',
  },
};

/**
 * Règle le solde « en compte » d'un client depuis la fiche client (caisse) :
 * crédite le solde du montant réglé et solde les factures de période en attente.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const out = await InvoiceService.settleAccount({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      customerId: params.id,
      amount: parsed.data.amount,
      method: parsed.data.method,
      storeId: parsed.data.store_id,
    });
    return NextResponse.json(out);
  } catch (e) {
    const code = (e as Error).message;
    const mapped = ERR[code];
    if (mapped) return NextResponse.json({ error: code, message: mapped.message }, { status: mapped.status });
    // eslint-disable-next-line no-console
    console.error('[customers.settle-account] échec :', e);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
