import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { renderCreditNotePdf, type CreditNotePdfData } from '@/lib/services/credit-note-pdf';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const cn = await query<{
    id: string; number: string; amount: string; reason: string;
    status: string; fiscal_hash: string; created_at: string;
    sale_receipt_number: string | null;
    fiscal_event_id: string | null;
    org_name: string; org_legal: string; org_siret: string | null;
    org_vat: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null;
    customer_display: string | null;
    customer_siret: string | null;
    customer_vat: string | null;
    customer_address: { line1?: string; zip?: string; city?: string } | null;
  }>(
    `SELECT cn.id, cn.number, cn.amount::text, cn.reason, cn.status,
            cn.fiscal_hash, cn.created_at,
            s.receipt_number AS sale_receipt_number,
            (SELECT id FROM fiscal_events
              WHERE entity_type = 'credit_note' AND entity_id = cn.id) AS fiscal_event_id,
            o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
            o.vat_number AS org_vat, o.address AS org_address,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_display,
            c.siret AS customer_siret, c.vat_number AS customer_vat, c.address AS customer_address
       FROM credit_notes cn
       JOIN organizations o ON o.id = cn.organization_id
       LEFT JOIN sales s ON s.id = cn.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE cn.id = $1 AND cn.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (cn.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const r = cn.rows[0]!;

  // Récupère lines + refund_method depuis le payload du fiscal_event
  let lines: CreditNotePdfData['lines'] = [];
  let refundMethod = 'credit_note';
  let isFullReturn = false;
  if (r.fiscal_event_id) {
    const ev = await query<{ payload: {
      lines?: Array<{ label: string; quantity: number; refunded_ttc: number; tax_rate: number }>;
      refund_method?: string;
      is_full_return?: boolean;
    } }>(
      `SELECT payload FROM fiscal_events WHERE id = $1`,
      [r.fiscal_event_id],
    );
    const p = ev.rows[0]?.payload;
    lines = p?.lines ?? [];
    refundMethod = p?.refund_method ?? 'credit_note';
    isFullReturn = p?.is_full_return ?? false;
  }

  const data: CreditNotePdfData = {
    number: r.number,
    amount: Number(r.amount),
    reason: r.reason,
    status: r.status,
    refund_method: refundMethod,
    is_full_return: isFullReturn,
    issued_at: r.created_at,
    fiscal_hash: r.fiscal_hash,
    origin_receipt_number: r.sale_receipt_number,
    lines,
  };

  const buf = await renderCreditNotePdf(
    data,
    {
      name: r.org_name,
      legal_name: r.org_legal,
      siret: r.org_siret,
      vat_number: r.org_vat,
      address: r.org_address,
    },
    r.customer_display ? {
      name: r.customer_display,
      siret: r.customer_siret,
      vat_number: r.customer_vat,
      address: r.customer_address,
    } : null,
  );

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${r.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
