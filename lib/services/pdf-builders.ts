import 'server-only';
import { query } from '@/lib/db/client';
import { renderInvoicePdf, type InvoicePdfData } from './invoice-pdf';
import { loadInvoiceGroups } from './invoice-lines';
import { loadInvoiceSettings } from '@/lib/settings/invoice-server';
import { renderReceiptPdf, type ReceiptSnapshot, type OrgInfo } from './receipt-pdf';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';

/** Génère le PDF d'une facture (mêmes données que la route /pdf). */
export async function buildInvoicePdf(invoiceId: string, organizationId: string): Promise<{
  buffer: Buffer; number: string; customer_email: string | null; customer_name: string | null;
} | null> {
  const inv = await query<{
    number: string; invoice_type: string; status: string;
    issue_date: string | null; service_date: string | null; due_date: string | null;
    total_ht: string; total_tva: string; total_ttc: string;
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
    payment_terms: string | null; legal_mentions: string | null; notes: string | null;
    payment_method: string | null; paid_at: string | null;
    sale_id: string | null; store_id: string; fiscal_hash: string | null;
    org_name: string; org_legal: string; org_siret: string | null; org_vat: string | null;
    org_capital: string | null; org_ape: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null;
    org_contact: { email?: string; phone?: string } | null;
    customer_display: string | null; customer_siret: string | null; customer_vat: string | null;
    customer_email: string | null; customer_phone: string | null;
    customer_address: { line1?: string; zip?: string; city?: string } | null;
  }>(
    `SELECT i.number, i.invoice_type, i.status,
            i.issue_date::text, i.service_date::text, i.due_date::text,
            i.total_ht::text, i.total_tva::text, i.total_ttc::text,
            i.tva_breakdown, i.payment_terms, i.legal_mentions, i.notes,
            i.payment_method, i.paid_at::text, i.sale_id::text, i.store_id::text, i.fiscal_hash,
            o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
            o.vat_number AS org_vat, o.capital_social AS org_capital, o.ape_code AS org_ape,
            o.address AS org_address, o.contact AS org_contact,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_display,
            c.siret AS customer_siret, c.vat_number AS customer_vat,
            c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address
       FROM invoices i
       JOIN organizations o ON o.id = i.organization_id
       LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.id = $1 AND i.organization_id = $2`,
    [invoiceId, organizationId],
  );
  if (inv.rowCount === 0) return null;
  const r = inv.rows[0]!;

  const { lines, groups } = await loadInvoiceGroups(invoiceId, r.sale_id, r.notes);
  const invSettings = await loadInvoiceSettings(organizationId, r.store_id);

  const data: InvoicePdfData = {
    number: r.number, invoice_type: r.invoice_type, status: r.status,
    issue_date: r.issue_date ?? '', service_date: r.service_date, due_date: r.due_date,
    total_ht: Number(r.total_ht), total_tva: Number(r.total_tva), total_ttc: Number(r.total_ttc),
    tva_breakdown: r.tva_breakdown ?? [], payment_terms: r.payment_terms,
    legal_mentions: r.legal_mentions, notes: r.notes,
    payment_method: r.payment_method, paid_at: r.paid_at, fiscal_hash: r.fiscal_hash,
    lines, groups,
  };

  const buffer = await renderInvoicePdf(
    data,
    { name: r.org_name, legal_name: r.org_legal, siret: r.org_siret, vat_number: r.org_vat,
      capital_social: r.org_capital, ape_code: r.org_ape,
      address: r.org_address, email: r.org_contact?.email ?? null, phone: r.org_contact?.phone ?? null,
      bank: {
        show: invSettings.show_bank_details, holder: invSettings.bank_holder,
        name: invSettings.bank_name, iban: invSettings.bank_iban, bic: invSettings.bank_bic,
      } },
    { name: r.customer_display ?? 'Client', siret: r.customer_siret, vat_number: r.customer_vat,
      address: r.customer_address, email: r.customer_email, phone: r.customer_phone },
  );
  return { buffer, number: r.number, customer_email: r.customer_email, customer_name: r.customer_display };
}

/** Génère le PDF d'un ticket (mêmes données que la route /pdf). */
export async function buildReceiptPdf(receiptId: string, organizationId: string): Promise<{
  buffer: Buffer; number: string;
} | null> {
  const r = await query<{ id: string; number: string; snapshot: ReceiptSnapshot; fiscal_hash: string; sale_id: string }>(
    `SELECT id, number, snapshot, fiscal_hash, sale_id
       FROM receipts WHERE id = $1 AND organization_id = $2`,
    [receiptId, organizationId],
  );
  if (r.rowCount === 0) return null;
  const rec = r.rows[0]!;

  const ctx = await query<{
    org_name: string; org_legal: string; org_siret: string | null; org_vat: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null; org_phone: string | null;
    store_name: string | null; store_id: string; register_code: string | null; user_name: string | null;
  }>(
    `SELECT o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
            o.vat_number AS org_vat, o.address AS org_address, (o.contact->>'phone') AS org_phone,
            st.name AS store_name, st.id AS store_id, rg.code AS register_code, u.full_name AS user_name
       FROM sales s
       JOIN organizations o ON o.id = s.organization_id
       JOIN stores st ON st.id = s.store_id
       JOIN registers rg ON rg.id = s.register_id
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [rec.sale_id],
  );
  const c = ctx.rows[0]!;
  const org: OrgInfo = {
    name: c.org_name, legal_name: c.org_legal, siret: c.org_siret, vat_number: c.org_vat,
    address: c.org_address, phone: c.org_phone,
  };
  const receiptSettings = await loadReceiptSettings(organizationId, c.store_id);
  const buffer = await renderReceiptPdf(rec.snapshot, org, {
    fiscalHash: rec.fiscal_hash, storeName: c.store_name ?? undefined,
    registerCode: c.register_code ?? undefined, cashier: c.user_name ?? undefined, receipt: receiptSettings,
  });
  return { buffer, number: rec.number };
}
