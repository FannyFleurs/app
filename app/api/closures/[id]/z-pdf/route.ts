import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { computeDayReport } from '@/lib/services/day-report';
import { renderReportPdf } from '@/lib/services/z-report-pdf';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;

  const closure = await query<{
    business_date: string; store_id: string;
    cash_expected: string; cash_counted: string | null; cash_variance: string | null;
    fiscal_hash: string; sealed_at: string; closed_by_name: string;
  }>(
    `SELECT d.business_date, d.store_id,
            d.cash_expected::text, d.cash_counted::text, d.cash_variance::text,
            d.fiscal_hash, d.sealed_at, u.full_name AS closed_by_name
       FROM daily_closures d
       JOIN users u ON u.id = d.closed_by
      WHERE d.id = $1 AND d.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (closure.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const c = closure.rows[0]!;

  const report = await computeDayReport({
    organizationId: g.user.organizationId,
    storeId: c.store_id,
    businessDate: c.business_date,
    kind: 'Z',
    printedAt: new Date().toISOString(),
    sealed: {
      closed_by: c.closed_by_name,
      sealed_at: c.sealed_at,
      fiscal_hash: c.fiscal_hash,
      cash_counted: c.cash_counted != null ? Number(c.cash_counted) : null,
      cash_variance: c.cash_variance != null ? Number(c.cash_variance) : null,
      cash_expected: Number(c.cash_expected),
    },
  });

  const buf = await renderReportPdf(report);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Z-${c.business_date}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
