import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { reportRange, localDay } from '@/lib/reports/range';

export const dynamic = 'force-dynamic';

/**
 * Annulations : les ventes validées puis annulées sur la période.
 *
 * Une vente validée ne s'efface jamais — elle est contre-passée par un avoir.
 * Ce rapport liste ces contre-passations avec leur motif : un taux
 * d'annulation qui grimpe sur un poste ou un vendeur se voit ici.
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
    id: string; receipt_number: string | null; sold_at: string;
    cancelled_at: string | null; seller: string | null;
    customer: string | null; store: string | null;
    ht: string; ttc: string; reason: string | null;
  }>(
    `SELECT s.id,
            s.receipt_number,
            s.validated_at::text AS sold_at,
            MAX(cn.created_at)::text AS cancelled_at,
            u.full_name AS seller,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer,
            st.name AS store,
            s.total_ht::text  AS ht,
            s.total_ttc::text AS ttc,
            MAX(cn.reason) AS reason
       FROM sales s
       LEFT JOIN credit_notes cn ON cn.sale_id = s.id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN stores st ON st.id = s.store_id
      WHERE s.organization_id = $1
        AND s.status = 'cancelled_by_credit_note'
        AND ${DAY} BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY s.id, u.full_name, c.company_name, c.first_name, c.last_name, st.name
      ORDER BY s.validated_at DESC
      LIMIT 1000`,
    args,
  );

  const lines = rows.map((r) => ({
    id: r.id,
    date: r.sold_at,
    cancelled_at: r.cancelled_at,
    receipt: r.receipt_number,
    seller: r.seller,
    customer: r.customer,
    store: r.store,
    ht: Number(r.ht),
    ttc: Number(r.ttc),
    reason: r.reason,
  }));

  return NextResponse.json({
    lines,
    totals: {
      count: lines.length,
      ht: Number(lines.reduce((s, l) => s + l.ht, 0).toFixed(2)),
      ttc: Number(lines.reduce((s, l) => s + l.ttc, 0).toFixed(2)),
    },
    from, to, store_id: storeId,
  });
}
