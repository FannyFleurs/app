import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { InvoiceService } from '@/lib/services/invoice-service';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  payments: z.array(z.object({
    method: z.enum(['cash', 'card', 'check', 'transfer', 'gift_card', 'credit_note', 'other']),
    amount: z.number().positive(),
    given_amount: z.number().min(0).optional(),
    reference: z.string().max(80).optional(),
  })).min(1),
  store_id: z.string().uuid().optional(),
});

const ERR: Record<string, { status: number; message: string }> = {
  CUSTOMER_NOT_FOUND: { status: 404, message: 'Client introuvable.' },
  INVALID_AMOUNT: { status: 400, message: 'Montant invalide.' },
  NO_OPEN_SESSION: { status: 409, message: 'Aucune caisse ouverte : ouvrez la caisse avant d’encaisser en espèces.' },
  GIFT_CARD_NOT_FOUND: { status: 422, message: 'Carte cadeau introuvable.' },
  GIFT_CARD_INSUFFICIENT: { status: 422, message: 'Solde de la carte cadeau insuffisant.' },
  GIFT_CARD_NOT_USABLE: { status: 422, message: 'Carte cadeau inutilisable.' },
  GIFT_CARD_EXPIRED: { status: 422, message: 'Carte cadeau expirée.' },
  CREDIT_NOTE_NOT_FOUND: { status: 422, message: 'Avoir introuvable.' },
  CREDIT_NOTE_INSUFFICIENT: { status: 422, message: 'Montant de l’avoir insuffisant.' },
  CREDIT_NOTE_NOT_USABLE: { status: 422, message: 'Avoir inutilisable.' },
};

/**
 * Règle un solde « en compte » depuis l'écran de paiement classique de la
 * caisse (plusieurs modes possibles). Compté sur le Z (« Règlements compte »).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const out = await InvoiceService.settleAccountWithPayments({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      customerId: params.id,
      payments: parsed.data.payments,
      storeId: parsed.data.store_id,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'customers.settle_account_payment',
      entityType: 'customer', entityId: params.id,
      payload: { total: out.total, methods: parsed.data.payments.map((p) => p.method) },
    });
    return NextResponse.json(out);
  } catch (e) {
    const code = (e as Error).message;
    const mapped = ERR[code];
    if (mapped) return NextResponse.json({ error: code, message: mapped.message }, { status: mapped.status });
    // eslint-disable-next-line no-console
    console.error('[customers.settle-payment] échec :', e);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
