import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import {
  EINVOICING_KEY,
  mergeEInvoicingDefaults,
  type EInvoicingSettings,
} from '@/lib/settings/einvoicing';

/**
 * GET /api/invoices/[id]/e-invoice
 *
 * Sérialise une facture dans un JSON normalisé, PIVOT NEUTRE de la
 * facturation électronique française. Ce format générique regroupe les
 * mentions obligatoires (vendeur, acheteur, lignes, ventilation TVA,
 * totaux, dates). Il n'est PAS figé sur un format légal : une
 * plateforme agréée (PDP) ou un connecteur pourra le convertir en
 * Factur-X / UBL / CII le moment venu.
 *
 * ?download=1 pour forcer le téléchargement du fichier.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const inv = await query<{
    number: string; invoice_type: string; status: string;
    issue_date: string | null; service_date: string | null; due_date: string | null;
    total_ht: string; total_tva: string; total_ttc: string;
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
    payment_terms: string | null; legal_mentions: string | null;
    fiscal_hash: string | null;
    org_name: string; org_legal: string; org_siret: string | null; org_siren: string | null;
    org_vat: string | null;
    org_address: { line1?: string; zip?: string; city?: string; country?: string } | null;
    org_contact: { email?: string; phone?: string } | null;
    customer_type: string | null;
    customer_display: string | null;
    customer_siret: string | null; customer_siren: string | null;
    customer_vat: string | null;
    customer_service_code: string | null; customer_commitment: string | null;
    customer_email: string | null; customer_phone: string | null;
    customer_address: { line1?: string; zip?: string; city?: string; country?: string } | null;
  }>(
    `SELECT i.number, i.invoice_type, i.status,
            i.issue_date, i.service_date, i.due_date,
            i.total_ht::text, i.total_tva::text, i.total_ttc::text,
            i.tva_breakdown, i.payment_terms, i.legal_mentions, i.fiscal_hash,
            o.name AS org_name, o.legal_name AS org_legal,
            o.siret AS org_siret, o.siren AS org_siren,
            o.vat_number AS org_vat, o.address AS org_address, o.contact AS org_contact,
            c.type AS customer_type,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_display,
            c.siret AS customer_siret, c.siren AS customer_siren,
            c.vat_number AS customer_vat,
            c.public_service_code AS customer_service_code,
            c.commitment_number AS customer_commitment,
            c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address
       FROM invoices i
       JOIN organizations o ON o.id = i.organization_id
       LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.id = $1 AND i.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (inv.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const r = inv.rows[0]!;

  const lines = await query<{
    label: string; quantity: string; unit_price_ht: string;
    discount_pct: string; tax_rate: string; tax_rate_code: string;
    line_ht: string; line_tva: string; line_ttc: string;
  }>(
    `SELECT label, quantity::text, unit_price_ht::text, discount_pct::text,
            tax_rate::text, tax_rate_code, line_ht::text, line_tva::text, line_ttc::text
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_index`,
    [params.id],
  );

  // Config e-facturation (format cible declare) — informatif.
  const settingsRow = await query<{ value: Partial<EInvoicingSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, EINVOICING_KEY],
  );
  const eSettings = mergeEInvoicingDefaults(settingsRow.rows[0]?.value ?? null);

  // Catégorie de facturation : B2B / B2C / B2G selon le type client.
  const cat = customerCategory(r.customer_type);

  const payload = {
    schema: 'webpos.e-invoice.v1',
    target_format: eSettings.format,
    generated_at: null as string | null, // horodaté à la volée côté consommateur
    invoice: {
      number: r.number,
      type: r.invoice_type,
      status: r.status,
      issue_date: r.issue_date,
      service_date: r.service_date,
      due_date: r.due_date,
      currency: 'EUR',
      category: cat, // B2B | B2C | B2G
    },
    seller: {
      name: r.org_name,
      legal_name: r.org_legal,
      siren: r.org_siren,
      siret: r.org_siret,
      vat_number: r.org_vat,
      address: r.org_address ?? {},
      email: r.org_contact?.email ?? null,
      phone: r.org_contact?.phone ?? null,
    },
    buyer: {
      type: r.customer_type,
      name: r.customer_display,
      siren: r.customer_siren,
      siret: r.customer_siret,
      vat_number: r.customer_vat,
      // Chorus Pro (secteur public)
      public_service_code: r.customer_service_code,
      commitment_number: r.customer_commitment,
      address: r.customer_address ?? {},
      email: r.customer_email,
      phone: r.customer_phone,
    },
    lines: lines.rows.map((l, idx) => ({
      index: idx + 1,
      label: l.label,
      quantity: Number(l.quantity),
      unit_price_ht: Number(l.unit_price_ht),
      discount_pct: Number(l.discount_pct),
      tax_rate: Number(l.tax_rate),
      tax_rate_code: l.tax_rate_code,
      line_ht: Number(l.line_ht),
      line_tva: Number(l.line_tva),
      line_ttc: Number(l.line_ttc),
    })),
    tax_breakdown: (r.tva_breakdown ?? []).map((t) => ({
      rate: t.rate,
      base_ht: t.base_ht,
      tva: t.tva,
      ttc: t.ttc,
    })),
    totals: {
      total_ht: Number(r.total_ht),
      total_tva: Number(r.total_tva),
      total_ttc: Number(r.total_ttc),
    },
    payment_terms: r.payment_terms,
    legal_mentions: r.legal_mentions,
    fiscal_hash: r.fiscal_hash,
  };

  const url = new URL(req.url);
  const download = url.searchParams.get('download') === '1';
  const body = JSON.stringify(payload, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(download
        ? { 'Content-Disposition': `attachment; filename="facture-${r.number || params.id}.json"` }
        : {}),
    },
  });
}

/** Catégorie de facturation selon le type de client. */
function customerCategory(type: string | null): 'B2B' | 'B2C' | 'B2G' {
  switch (type) {
    case 'collectivite': return 'B2G';
    case 'professionnel':
    case 'association': return 'B2B';
    default: return 'B2C';
  }
}
