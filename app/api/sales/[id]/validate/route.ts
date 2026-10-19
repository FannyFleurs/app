import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { validateSaleAndNotify } from '@/lib/services/sale-validate-and-notify';

const paymentSchema = z.object({
  method: z.enum(['cash','card','check','transfer','gift_card','credit_note','deferred','other','payment_link','loyalty']),
  amount: z.number().positive(),
  given_amount: z.number().min(0).optional(),
  reference: z.string().max(80).optional(),
  // Libellé exact du mode de règlement choisi (ex. "Paiement Web"), figé
  // pour cette vente — voir migrations/0094_payments_label.sql.
  label: z.string().max(120).optional(),
});

const schema = z.object({
  // Tableau vide autorisé : une vente à 0 € (entièrement remisée / offerte)
  // est scellée sans règlement. Le service refuse toujours un total > 0 sans
  // paiements suffisants (PAYMENTS_MISMATCH).
  payments: z.array(paymentSchema),
  loyalty_redemption_amount: z.number().min(0).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  try {
    const out = await validateSaleAndNotify({
      saleId: params.id,
      organizationId: g.user.organizationId,
      userId: g.user.id,
      payments: parsed.data.payments,
      loyaltyRedemptionAmount: parsed.data.loyalty_redemption_amount,
    });

    return NextResponse.json({
      sale_id: out.saleId,
      receipt_number: out.receiptNumber,
      receipt_id: out.receiptId,
      fiscal_hash: out.fiscalHash,
      fiscal_event_id: out.fiscalEventId,
      loyalty: out.loyalty ?? null,
      stock_movements: out.stock_movements ?? 0,
      // `printed` = sorti sur l'imprimante ticket ; sinon le client ouvre le PDF.
      gift_cards_issued: (out.gift_cards_issued ?? []).map((gc) => ({
        id: gc.id, code: gc.code, amount: gc.amount, printed: out.printedGiftCardIds.includes(gc.id),
      })),
    });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'PAYMENTS_MISMATCH' ? 422 :
      msg === 'SALE_ALREADY_VALIDATED' ? 409 :
      msg === 'SALE_NOT_FOUND' ? 404 :
      msg === 'SALE_EMPTY' ? 422 :
      msg === 'LOYALTY_INSUFFICIENT_BALANCE' ? 422 :
      msg === 'DEFERRED_REQUIRES_CUSTOMER' ? 422 :
      msg.startsWith('CREDIT_NOTE_') ? 422 :
      msg.startsWith('GIFT_CARD_') ? 422 : 400;
    return jsonError(msg, status);
  }
}
