import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { renderInvoicePdf, buildInvoiceEmitter, type InvoicePdfData } from '@/lib/services/invoice-pdf';
import { loadInvoiceGroups } from '@/lib/services/invoice-lines';
import { loadInvoiceSettings } from '@/lib/settings/invoice-server';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const inv = await query<{
    number: string; invoice_type: string; status: string;
    issue_date: string | null; service_date: string | null; due_date: string | null;
    total_ht: string; total_tva: string; total_ttc: string;
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
    payment_terms: string | null; legal_mentions: string | null; notes: string | null;
    payment_method: string | null; paid_at: string | null;
    sale_id: string | null; store_id: string;
    fiscal_hash: string | null;
    org_name: string; org_legal: string; org_siret: string | null;
    org_vat: string | null; org_capital: string | null; org_ape: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null;
    org_contact: { email?: string; phone?: string } | null;
    customer_display: string | null;
    customer_siret: string | null;
    customer_vat: string | null;
    customer_email: string | null;
    customer_phone: string | null;
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
    [params.id, g.user.organizationId],
  );
  if (inv.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const r = inv.rows[0]!;

  const { lines, groups } = await loadInvoiceGroups(params.id, r.sale_id, r.notes);
  const invSettings = await loadInvoiceSettings(g.user.organizationId, r.store_id);
  // En-tête émetteur : nom / adresse / téléphone de la BOUTIQUE (paramétrage
  // ticket de la boutique), pas de l'organisation. Le pied légal (raison
  // sociale, SIRET…) reste celui de l'organisation.
  const emitter = buildInvoiceEmitter(
    await loadReceiptSettings(g.user.organizationId, r.store_id), r,
    { show: invSettings.show_bank_details, holder: invSettings.bank_holder, name: invSettings.bank_name, iban: invSettings.bank_iban, bic: invSettings.bank_bic },
  );

  const data: InvoicePdfData = {
    number: r.number,
    invoice_type: r.invoice_type,
    status: r.status,
    issue_date: r.issue_date ?? '',
    service_date: r.service_date,
    due_date: r.due_date,
    total_ht: Number(r.total_ht),
    total_tva: Number(r.total_tva),
    total_ttc: Number(r.total_ttc),
    tva_breakdown: r.tva_breakdown ?? [],
    payment_terms: r.payment_terms,
    legal_mentions: r.legal_mentions,
    notes: r.notes,
    payment_method: r.payment_method,
    paid_at: r.paid_at,
    fiscal_hash: r.fiscal_hash,
    lines,
    groups,
  };

  const pdf = await renderInvoicePdf(
    data,
    emitter,
    {
      name: r.customer_display ?? 'Client',
      siret: r.customer_siret,
      vat_number: r.customer_vat,
      address: r.customer_address,
      email: r.customer_email,
      phone: r.customer_phone,
    },
  );

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${r.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
