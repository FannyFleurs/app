import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { renderZReportPdf, type ZReportData } from '@/lib/services/z-report-pdf';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;

  // Récupère la clôture + payload fiscal (qui contient le détail complet figé)
  const closure = await query<{
    id: string; business_date: string;
    total_sales: number;
    total_ht: string; total_tva: string; total_ttc: string;
    discounts_total: string;
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
    payments_breakdown: { method: string; counted: number; declared?: number; variance?: number }[];
    cash_expected: string; cash_counted: string | null; cash_variance: string | null;
    fiscal_hash: string;
    sealed_at: string;
    fiscal_event_id: string;
    store_name: string;
    closed_by_name: string;
    org_name: string; org_legal: string; org_siret: string | null;
    org_vat: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null;
  }>(
    `SELECT d.id, d.business_date, d.total_sales,
            d.total_ht::text, d.total_tva::text, d.total_ttc::text,
            d.discounts_total::text,
            d.tva_breakdown, d.payments_breakdown,
            d.cash_expected::text, d.cash_counted::text, d.cash_variance::text,
            d.fiscal_hash, d.sealed_at, d.fiscal_event_id,
            s.name AS store_name,
            u.full_name AS closed_by_name,
            o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
            o.vat_number AS org_vat, o.address AS org_address
       FROM daily_closures d
       JOIN stores s ON s.id = d.store_id
       JOIN users u ON u.id = d.closed_by
       JOIN organizations o ON o.id = d.organization_id
      WHERE d.id = $1 AND d.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (closure.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const c = closure.rows[0]!;

  // Détails additionnels via le payload fiscal (denominations, notes)
  const ev = await query<{ payload: { denomination_count?: Record<string, number>; notes?: string | null } }>(
    `SELECT payload FROM fiscal_events WHERE id = $1`,
    [c.fiscal_event_id],
  );
  const denom = ev.rows[0]?.payload?.denomination_count ?? undefined;

  // Remises en banque du jour
  const depositsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cm.amount), 0)::text AS total
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.organization_id = $1
        AND cs.opened_at::date = $2::date
        AND cm.movement_type = 'out'
        AND cm.reason ILIKE '%banque%'`,
    [g.user.organizationId, c.business_date],
  );
  const bankDeposits = Number(depositsRes.rows[0]?.total ?? 0);

  // Marge brute du jour : Σ(line_ht) - Σ(quantity × purchase_price_ht)
  // Calcul live à partir du purchase_price_ht courant (V1).
  const marginRes = await query<{ revenue: string; cost: string; lines_with_cost: string; total_lines: string }>(
    `SELECT
        COALESCE(SUM(CASE WHEN p.purchase_price_ht IS NOT NULL AND p.purchase_price_ht > 0
                          THEN sl.line_ht ELSE 0 END), 0)::text AS revenue,
        COALESCE(SUM(CASE WHEN p.purchase_price_ht IS NOT NULL AND p.purchase_price_ht > 0
                          THEN p.purchase_price_ht * sl.quantity ELSE 0 END), 0)::text AS cost,
        COUNT(*) FILTER (WHERE p.purchase_price_ht IS NOT NULL AND p.purchase_price_ht > 0)::text AS lines_with_cost,
        COUNT(*)::text AS total_lines
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date = $2::date`,
    [g.user.organizationId, c.business_date],
  );
  const revenueHt = Number(marginRes.rows[0]?.revenue ?? 0);
  const costHt = Number(marginRes.rows[0]?.cost ?? 0);
  const linesWithCost = Number(marginRes.rows[0]?.lines_with_cost ?? 0);
  const totalLines = Number(marginRes.rows[0]?.total_lines ?? 0);

  const data: ZReportData = {
    business_date: c.business_date,
    store_name: c.store_name,
    closed_by: c.closed_by_name,
    sealed_at: c.sealed_at,
    fiscal_hash: c.fiscal_hash,
    totals: {
      total_sales: Number(c.total_sales),
      total_ht: Number(c.total_ht),
      total_tva: Number(c.total_tva),
      total_ttc: Number(c.total_ttc),
      discounts_total: Number(c.discounts_total),
    },
    tva_breakdown: c.tva_breakdown ?? [],
    payments_breakdown: c.payments_breakdown ?? [],
    cash: {
      expected: Number(c.cash_expected),
      counted: c.cash_counted != null ? Number(c.cash_counted) : Number(c.cash_expected),
      variance: c.cash_variance != null ? Number(c.cash_variance) : 0,
      denomination_count: denom,
      bank_deposits: bankDeposits,
    },
    margin: linesWithCost > 0 ? {
      revenue_ht: revenueHt,
      cost_ht: costHt,
      gross: revenueHt - costHt,
      percent: revenueHt > 0 ? ((revenueHt - costHt) / revenueHt) * 100 : 0,
      lines_with_cost: linesWithCost,
      total_lines: totalLines,
    } : undefined,
  };

  const buf = await renderZReportPdf(data, {
    name: c.org_name,
    legal_name: c.org_legal,
    siret: c.org_siret,
    vat_number: c.org_vat,
    address: c.org_address,
  });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Z-${c.business_date}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
