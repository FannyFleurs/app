import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';
import { audit } from '@/lib/audit/log';
import { query } from '@/lib/db/client';
import { pushWalletUpdateForCustomer } from '@/lib/wallet/notify';
import { autoSendReceiptIfEnabled } from '@/lib/email/auto-send';
import { resolveReceiptPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';
import { buildDrawerKickStarPrnt, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/receipt-star';

const paymentSchema = z.object({
  method: z.enum(['cash','card','check','transfer','gift_card','credit_note','deferred','other','payment_link']),
  amount: z.number().positive(),
  given_amount: z.number().min(0).optional(),
  reference: z.string().max(80).optional(),
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
    const out = await SaleService.validate({
      saleId: params.id,
      organizationId: g.user.organizationId,
      userId: g.user.id,
      payments: parsed.data.payments,
      loyaltyRedemptionAmount: parsed.data.loyalty_redemption_amount,
    });
    await audit({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      action: 'sales.validate',
      entityType: 'sale',
      entityId: params.id,
      payload: { receipt_number: out.receiptNumber },
    });

    // Fire-and-forget : si la vente a fait bouger le solde fidelite d'un
    // client attache, on notifie ses cartes Apple Wallet enregistrees.
    // Aucune erreur n'est propagee — la vente est deja validee.
    if (out.loyalty) {
      void (async () => {
        try {
          const s = await query<{ customer_id: string | null }>(
            `SELECT customer_id FROM sales WHERE id = $1`,
            [params.id],
          );
          const cid = s.rows[0]?.customer_id;
          if (cid) await pushWalletUpdateForCustomer(cid, g.user.organizationId);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[wallet.push.after_sale]', err);
        }
      })();
    }

    // Envoi automatique du ticket par email si activé et si le client a une
    // adresse. Fire-and-forget : la vente est déjà validée.
    if (out.receiptId) void autoSendReceiptIfEnabled(out.receiptId, g.user.organizationId);

    // Ouverture du tiroir selon les modes de règlement (ex. espèces oui,
    // chèque non). Fire-and-forget, indépendant de l'impression du ticket.
    void (async () => {
      try {
        const kinds = Array.from(new Set(parsed.data.payments.map((p) => p.method)));
        if (kinds.length === 0) return;
        const dm = await query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM payment_methods
            WHERE organization_id = $1 AND opens_drawer = TRUE AND kind = ANY($2::text[])`,
          [g.user.organizationId, kinds],
        );
        if (!dm.rows[0]?.n) return;
        const st = await query<{ store_id: string }>(`SELECT store_id FROM sales WHERE id = $1`, [params.id]);
        const printer = await resolveReceiptPrinter(g.user.organizationId, st.rows[0]?.store_id ?? null);
        if (!printer) return;
        const payload = await buildDrawerKickStarPrnt();
        await enqueueJob({
          organizationId: g.user.organizationId, printerId: printer.id,
          contentType: STARPRNT_CONTENT_TYPE, payload,
          title: 'Ouverture tiroir (encaissement)', userId: g.user.id,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[drawer.after_sale]', err);
      }
    })();

    return NextResponse.json({
      sale_id: out.saleId,
      receipt_number: out.receiptNumber,
      receipt_id: out.receiptId,
      fiscal_hash: out.fiscalHash,
      fiscal_event_id: out.fiscalEventId,
      loyalty: out.loyalty ?? null,
      stock_movements: out.stock_movements ?? 0,
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
