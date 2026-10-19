import { query } from '@/lib/db/client';
import { SaleService, type SalePaymentInput } from './sale-service';
import { audit } from '@/lib/audit/log';
import { pushWalletUpdateForCustomer } from '@/lib/wallet/notify';
import { autoSendReceiptIfEnabled } from '@/lib/email/auto-send';
import { resolveReceiptPrinter, enqueueJob } from './cloudprnt/queue';
import { buildDrawerKickStarPrnt, STARPRNT_CONTENT_TYPE } from './cloudprnt/receipt-star';
import { enqueueGiftCardPrint, NoReceiptPrinterError as GiftCardNoPrinter } from './cloudprnt/print-gift-card';
import { notifyOrderPaidIfNeeded } from '@/lib/orders/notify-paid';

/**
 * Encaisse une vente ET déclenche tous les effets de bord de l'encaissement
 * (audit, carte Wallet, envoi auto du ticket, ouverture tiroir, impression
 * carte cadeau, callback "Payé" vers l'app commande) — extrait de
 * `POST /api/sales/[id]/validate` pour être appelé aussi bien depuis cette
 * route QUE depuis l'encaissement automatique des commandes WEB/OGF
 * (order-intake.ts), qui n'a ni requête HTTP ni session utilisateur.
 *
 * `skipDrawerKick` : la caisse virtuelle (commandes auto-encaissées, voir
 * virtual-register.ts) n'a pas de tiroir physique — l'ouvrir serait un
 * déclenchement fantôme sur l'imprimante réelle de la boutique, boutique
 * potentiellement fermée.
 */
export async function validateSaleAndNotify(args: {
  saleId: string;
  organizationId: string;
  userId: string;
  payments: SalePaymentInput[];
  loyaltyRedemptionAmount?: number;
  skipDrawerKick?: boolean;
}): Promise<Awaited<ReturnType<typeof SaleService.validate>> & { printedGiftCardIds: string[] }> {
  const out = await SaleService.validate({
    saleId: args.saleId,
    organizationId: args.organizationId,
    userId: args.userId,
    payments: args.payments,
    loyaltyRedemptionAmount: args.loyaltyRedemptionAmount,
  });

  await audit({
    organizationId: args.organizationId,
    userId: args.userId,
    action: 'sales.validate',
    entityType: 'sale',
    entityId: args.saleId,
    payload: { receipt_number: out.receiptNumber },
  });

  if (out.loyalty) {
    void (async () => {
      try {
        const s = await query<{ customer_id: string | null }>(
          `SELECT customer_id FROM sales WHERE id = $1`,
          [args.saleId],
        );
        const cid = s.rows[0]?.customer_id;
        if (cid) await pushWalletUpdateForCustomer(cid, args.organizationId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[wallet.push.after_sale]', err);
      }
    })();
  }

  if (out.receiptId) void autoSendReceiptIfEnabled(out.receiptId, args.organizationId);

  if (!args.skipDrawerKick) {
    try {
      const kinds = Array.from(new Set(args.payments.map((p) => p.method)));
      if (kinds.length > 0) {
        const dm = await query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM payment_methods
            WHERE organization_id = $1 AND opens_drawer = TRUE AND kind = ANY($2::text[])`,
          [args.organizationId, kinds],
        );
        if (dm.rows[0]?.n) {
          const st = await query<{ store_id: string }>(`SELECT store_id FROM sales WHERE id = $1`, [args.saleId]);
          const printer = await resolveReceiptPrinter(args.organizationId, st.rows[0]?.store_id ?? null);
          if (printer) {
            const payload = await buildDrawerKickStarPrnt();
            await enqueueJob({
              organizationId: args.organizationId, printerId: printer.id,
              contentType: STARPRNT_CONTENT_TYPE, payload,
              title: 'Ouverture tiroir (encaissement)', userId: args.userId,
            });
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[drawer.after_sale]', err);
    }
  }

  const printedIds = new Set<string>();
  for (const gc of out.gift_cards_issued ?? []) {
    try {
      await enqueueGiftCardPrint({
        organizationId: args.organizationId, userId: args.userId, giftCardId: gc.id,
      });
      printedIds.add(gc.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      if (!(err instanceof GiftCardNoPrinter)) console.error('[giftcard.print.after_sale]', err);
    }
  }

  await notifyOrderPaidIfNeeded({
    organizationId: args.organizationId,
    saleId: out.saleId,
    receiptNumber: out.receiptNumber,
    totalTtc: Number((out.snapshot as { totals?: { total_ttc?: number } })?.totals?.total_ttc ?? 0),
  });

  return { ...out, printedGiftCardIds: Array.from(printedIds) };
}
