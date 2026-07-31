import 'server-only';
import { query } from '@/lib/db/client';
import { type ReceiptSnapshot, type OrgInfo } from '@/lib/services/receipt-pdf';
import { loadReceiptExtras } from '@/lib/services/receipt-extras';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { resolveReceiptPrinter, enqueueJob } from './queue';
import { buildReceiptStarPrnt, STARPRNT_CONTENT_TYPE } from './receipt-star';

export class NoReceiptPrinterError extends Error {
  constructor() { super('NO_PRINTER'); }
}
export class ReceiptNotFoundError extends Error {
  constructor() { super('RECEIPT_NOT_FOUND'); }
}

/**
 * Met en file un ticket (StarPRNT) sur l'imprimante TICKET CloudPRNT de la
 * boutique. Charge les mêmes données que le PDF (snapshot, boutique, vendeur,
 * paramétrage ticket, fidélité). Ouvre le tiroir si la vente comporte un
 * règlement espèces (sauf ticket sans prix).
 */
export async function enqueueReceiptPrint(args: {
  organizationId: string;
  userId: string;
  receiptId?: string;
  saleId?: string;
  gift?: boolean;
  giftLineIndices?: number[] | null;
}): Promise<{ printer_label: string }> {
  const rec = await query<{
    id: string; number: string; snapshot: ReceiptSnapshot; fiscal_hash: string; sale_id: string;
  }>(
    args.receiptId
      ? `SELECT id, number, snapshot, fiscal_hash, sale_id
           FROM receipts WHERE id = $1 AND organization_id = $2`
      : `SELECT id, number, snapshot, fiscal_hash, sale_id
           FROM receipts WHERE sale_id = $1 AND organization_id = $2 LIMIT 1`,
    [args.receiptId ?? args.saleId, args.organizationId],
  );
  if (rec.rowCount === 0) throw new ReceiptNotFoundError();
  const r = rec.rows[0]!;

  const ctx = await query<{
    org_name: string; org_legal: string; org_siret: string | null; org_vat: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null; org_phone: string | null;
    store_id: string; user_name: string | null;
  }>(
    `SELECT o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
            o.vat_number AS org_vat, o.address AS org_address, (o.contact->>'phone') AS org_phone,
            s.store_id AS store_id, u.full_name AS user_name
       FROM sales s
       JOIN organizations o ON o.id = s.organization_id
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [r.sale_id],
  );
  const c = ctx.rows[0]!;
  const org: OrgInfo = {
    name: c.org_name, legal_name: c.org_legal, siret: c.org_siret, vat_number: c.org_vat,
    address: c.org_address, phone: c.org_phone,
  };

  const printer = await resolveReceiptPrinter(args.organizationId, c.store_id);
  if (!printer) throw new NoReceiptPrinterError();

  const gift = args.gift === true;
  const receiptSettings = await loadReceiptSettings(args.organizationId, c.store_id);
  const extras = gift
    ? { customerName: null, loyalty: null }
    : await loadReceiptExtras(args.organizationId, r.sale_id);
  const hasCash = !gift && (r.snapshot.payments ?? []).some((p) => p.method === 'cash');

  const payload = await buildReceiptStarPrnt(r.snapshot, org, {
    fiscalHash: r.fiscal_hash,
    cashier: c.user_name,
    receipt: receiptSettings,
    giftReceipt: gift,
    giftLineIndices: args.giftLineIndices ?? null,
    customerName: extras.customerName,
    loyalty: extras.loyalty,
    openDrawer: hasCash,
    paperWidthMm: printer.paper_width,
  });

  await enqueueJob({
    organizationId: args.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: `Ticket ${r.number}${gift ? ' (sans prix)' : ''}`,
    userId: args.userId,
  });

  return { printer_label: printer.label };
}
