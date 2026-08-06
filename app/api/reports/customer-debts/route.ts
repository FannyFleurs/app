import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { reportRange, localDay } from '@/lib/reports/range';

export const dynamic = 'force-dynamic';

/**
 * Dettes clients : les ventes réglées « en compte » sur la période.
 *
 * Une ligne par ticket ayant un règlement différé. On expose à la fois le
 * montant mis en compte SUR CE TICKET et le solde ACTUEL du client : le
 * premier explique d'où vient la dette, le second dit ce qui reste dû
 * aujourd'hui, après d'éventuels règlements ultérieurs.
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const range = reportRange(req, g.user.organizationId);
  if ('response' in range) return range.response;
  const { from, to, storeId, args } = range;
  const storeFilter = storeId ? 'AND s.store_id = $4' : '';
  const DAY = localDay('s.validated_at');

  const { rows } = await query<{
    sale_id: string; receipt_number: string | null; sold_at: string;
    seller: string | null; customer: string | null; store: string | null;
    ht: string; ttc: string; deferred: string; balance: string | null;
  }>(
    `SELECT s.id AS sale_id,
            s.receipt_number,
            s.validated_at::text AS sold_at,
            u.full_name AS seller,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer,
            st.name AS store,
            s.total_ht::text  AS ht,
            s.total_ttc::text AS ttc,
            SUM(p.amount)::text AS deferred,
            MAX(c.account_balance)::text AS balance
       FROM sales s
       JOIN payments p ON p.sale_id = s.id AND p.method = 'deferred'
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN stores st ON st.id = s.store_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND ${DAY} BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY s.id, u.full_name, c.company_name, c.first_name, c.last_name, st.name
      HAVING SUM(p.amount) > 0
      ORDER BY s.validated_at DESC
      LIMIT 1000`,
    args,
  );

  const n = (v: string | null) => Number(v ?? 0);
  const lines = rows.map((r) => ({
    sale_id: r.sale_id,
    receipt: r.receipt_number,
    date: r.sold_at,
    seller: r.seller,
    customer: r.customer,
    store: r.store,
    ht: n(r.ht),
    ttc: n(r.ttc),
    deferred: n(r.deferred),
    balance: r.balance == null ? null : n(r.balance),
  }));

  return NextResponse.json({
    lines,
    totals: {
      count: lines.length,
      ht: round(lines.reduce((s, l) => s + l.ht, 0)),
      ttc: round(lines.reduce((s, l) => s + l.ttc, 0)),
      deferred: round(lines.reduce((s, l) => s + l.deferred, 0)),
    },
    from, to, store_id: storeId,
  });
}

function round(v: number) { return Number(v.toFixed(2)); }
