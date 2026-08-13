import 'server-only';
import { query } from '@/lib/db/client';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { creditNoteCopies } from '@/lib/settings/receipt';
import { resolveReceiptPrinter, enqueueJob } from './queue';
import { buildCreditNoteStarPrnt, STARPRNT_CONTENT_TYPE, type CreditNoteReceiptData } from './receipt-star';

export class NoReceiptPrinterError extends Error {
  constructor() { super('NO_PRINTER'); }
}
export class CreditNoteNotFoundError extends Error {
  constructor() { super('CREDIT_NOTE_NOT_FOUND'); }
}

/**
 * Met en file l'impression d'un avoir sur l'imprimante TICKET de la boutique,
 * en `copies` exemplaires (un pour le client, un pour la boutique par défaut).
 *
 * Charge les mêmes données que le PDF d'avoir : montant, motif, ticket
 * d'origine, client, lignes retournées (depuis le fiscal_event). Ne jette pas
 * faute d'imprimante côté appelant qui préfère un repli PDF — mais lève
 * NoReceiptPrinterError pour que l'appelant sache basculer.
 *
 * @param copies  Nombre d'exemplaires demandé. Si absent, on prend le réglage
 *                de la boutique (2 par défaut, borné 0..5). 0 = ne rien faire.
 */
export async function enqueueCreditNotePrint(args: {
  organizationId: string;
  userId: string;
  creditNoteId: string;
  copies?: number;
}): Promise<{ printer_label: string; copies: number }> {
  const cn = await query<{
    id: string; number: string; amount: string; reason: string; created_at: string;
    store_id: string; store_name: string;
    sale_receipt_number: string | null;
    customer_name: string | null;
    user_name: string | null;
    org_name: string;
    fiscal_event_id: string | null;
  }>(
    `SELECT cn.id, cn.number, cn.amount::text AS amount, cn.reason, cn.created_at,
            s.store_id AS store_id, st.name AS store_name,
            s.receipt_number AS sale_receipt_number,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
            u.full_name AS user_name,
            o.name AS org_name,
            (SELECT id FROM fiscal_events
              WHERE entity_type = 'credit_note' AND entity_id = cn.id) AS fiscal_event_id
       FROM credit_notes cn
       JOIN organizations o ON o.id = cn.organization_id
       LEFT JOIN sales s ON s.id = cn.sale_id
       LEFT JOIN stores st ON st.id = s.store_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = COALESCE(cn.customer_id, s.customer_id)
      WHERE cn.id = $1 AND cn.organization_id = $2`,
    [args.creditNoteId, args.organizationId],
  ).catch(async (err) => {
    // Repli sans cn.customer_id (migration 0014 pas appliquée).
    if (!(err as Error).message?.includes('customer_id')) throw err;
    return query<{
      id: string; number: string; amount: string; reason: string; created_at: string;
      store_id: string; store_name: string; sale_receipt_number: string | null;
      customer_name: string | null; user_name: string | null; org_name: string;
      fiscal_event_id: string | null;
    }>(
      `SELECT cn.id, cn.number, cn.amount::text AS amount, cn.reason, cn.created_at,
              s.store_id AS store_id, st.name AS store_name,
              s.receipt_number AS sale_receipt_number,
              COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
              u.full_name AS user_name, o.name AS org_name,
              (SELECT id FROM fiscal_events WHERE entity_type='credit_note' AND entity_id=cn.id) AS fiscal_event_id
         FROM credit_notes cn
         JOIN organizations o ON o.id = cn.organization_id
         LEFT JOIN sales s ON s.id = cn.sale_id
         LEFT JOIN stores st ON st.id = s.store_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE cn.id = $1 AND cn.organization_id = $2`,
      [args.creditNoteId, args.organizationId],
    );
  });
  if (cn.rowCount === 0) throw new CreditNoteNotFoundError();
  const r = cn.rows[0]!;

  // Lignes retournées + type de retour : dans le payload du fiscal_event.
  let lines: CreditNoteReceiptData['lines'] = [];
  let isFullReturn = false;
  if (r.fiscal_event_id) {
    const ev = await query<{ payload: {
      lines?: Array<{ label: string; quantity: number; refunded_ttc: number }>;
      is_full_return?: boolean;
    } }>(`SELECT payload FROM fiscal_events WHERE id = $1`, [r.fiscal_event_id]);
    const p = ev.rows[0]?.payload;
    lines = (p?.lines ?? []).map((l) => ({
      label: l.label, quantity: Number(l.quantity), refunded_ttc: Number(l.refunded_ttc),
    }));
    isFullReturn = p?.is_full_return ?? false;
  }

  const settings = await loadReceiptSettings(args.organizationId, r.store_id);
  const copies = args.copies != null
    ? Math.max(0, Math.min(5, Math.round(args.copies)))
    : creditNoteCopies(settings);
  if (copies === 0) return { printer_label: '', copies: 0 };

  const printer = await resolveReceiptPrinter(args.organizationId, r.store_id);
  if (!printer) throw new NoReceiptPrinterError();

  const data: CreditNoteReceiptData = {
    number: r.number, amount: Number(r.amount), reason: r.reason,
    is_full_return: isFullReturn, issued_at: r.created_at,
    origin_receipt_number: r.sale_receipt_number,
    org_name: r.org_name, store_name: r.store_name ?? r.org_name,
    user_name: r.user_name, customer_name: r.customer_name, lines,
  };
  const payload = await buildCreditNoteStarPrnt(data, settings, printer.paper_width);

  // Un job par exemplaire : l'imprimante coupe entre chaque, on obtient N
  // tickets distincts.
  for (let i = 0; i < copies; i++) {
    await enqueueJob({
      organizationId: args.organizationId, printerId: printer.id,
      contentType: STARPRNT_CONTENT_TYPE, payload,
      title: `Avoir ${r.number}${copies > 1 ? ` (${i + 1}/${copies})` : ''}`,
      userId: args.userId,
    });
  }
  return { printer_label: printer.label, copies };
}
