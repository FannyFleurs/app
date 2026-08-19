import 'server-only';
import { query } from '@/lib/db/client';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { resolveReceiptPrinter, enqueueJob } from './queue';
import { buildGiftCardStarPrnt, STARPRNT_CONTENT_TYPE, type GiftCardReceiptData } from './receipt-star';

export class NoReceiptPrinterError extends Error {
  constructor() { super('NO_PRINTER'); }
}
export class GiftCardNotFoundError extends Error {
  constructor() { super('GIFT_CARD_NOT_FOUND'); }
}

/**
 * Met en file l'impression d'une carte cadeau sur l'imprimante TICKET de la
 * boutique. L'imprimante est résolue via la boutique de la vente d'origine si
 * elle existe, sinon l'imprimante par défaut de l'organisation.
 * Lève NoReceiptPrinterError si aucune imprimante ticket n'est configurée, pour
 * que l'appelant puisse basculer sur le PDF.
 */
export async function enqueueGiftCardPrint(args: {
  organizationId: string;
  userId: string;
  giftCardId: string;
  copies?: number;
}): Promise<{ printer_label: string; copies: number }> {
  const gc = await query<{
    code: string; initial_amount: string; balance: string;
    issued_at: string; expires_at: string | null; buyer_name: string | null;
    store_id: string | null; store_name: string | null; org_name: string;
  }>(
    `SELECT gc.code, gc.initial_amount::text AS initial_amount, gc.balance::text AS balance,
            gc.issued_at, gc.expires_at, gc.buyer_name,
            s.store_id AS store_id, st.name AS store_name, o.name AS org_name
       FROM gift_cards gc
       JOIN organizations o ON o.id = gc.organization_id
       LEFT JOIN sales s ON s.id = gc.sale_id
       LEFT JOIN stores st ON st.id = s.store_id
      WHERE gc.id = $1 AND gc.organization_id = $2`,
    [args.giftCardId, args.organizationId],
  );
  if (gc.rowCount === 0) throw new GiftCardNotFoundError();
  const r = gc.rows[0]!;

  const copies = Math.max(1, Math.min(5, Math.round(args.copies ?? 1)));
  const settings = await loadReceiptSettings(args.organizationId, r.store_id ?? null);
  const printer = await resolveReceiptPrinter(args.organizationId, r.store_id ?? null);
  if (!printer) throw new NoReceiptPrinterError();

  const data: GiftCardReceiptData = {
    code: r.code,
    initial_amount: Number(r.initial_amount),
    balance: Number(r.balance),
    issued_at: r.issued_at,
    expires_at: r.expires_at,
    buyer_name: r.buyer_name,
    org_name: r.org_name,
    store_name: r.store_name ?? r.org_name,
  };
  const payload = await buildGiftCardStarPrnt(data, settings, printer.paper_width);

  for (let i = 0; i < copies; i++) {
    await enqueueJob({
      organizationId: args.organizationId, printerId: printer.id,
      contentType: STARPRNT_CONTENT_TYPE, payload,
      title: `Carte cadeau ${r.code}${copies > 1 ? ` (${i + 1}/${copies})` : ''}`,
      userId: args.userId,
    });
  }
  return { printer_label: printer.label, copies };
}
