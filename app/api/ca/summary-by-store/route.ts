import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prev_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  prev_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * CA par boutique, en un coup d'œil (sans avoir à sélectionner une boutique
 * à la fois). Inclut la variation vs prev_from/prev_to si fournis (l'appelant
 * décide de la période de comparaison, ex. N-1) ; sinon pas de variation.
 */
export async function GET(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    from: url.searchParams.get('from'),
    to:   url.searchParams.get('to'),
    prev_from: url.searchParams.get('prev_from') || undefined,
    prev_to:   url.searchParams.get('prev_to') || undefined,
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { from, to, prev_from, prev_to } = parsed.data;
  const orgId = g.user.organizationId;

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [orgId],
  );

  const sales = await query<{ store_id: string; ca_ttc: string; tickets_count: number }>(
    `SELECT s.store_id::text AS store_id,
            COALESCE(SUM(s.total_ttc), 0)::text AS ca_ttc,
            COUNT(*)::int AS tickets_count
       FROM sales s
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
      GROUP BY s.store_id`,
    [orgId, from, to],
  );

  const margin = await query<{ store_id: string; revenue_ht: string; cost_ht: string; items_sold: string }>(
    `SELECT s.store_id::text AS store_id,
            COALESCE(SUM(sl.line_ht), 0)::text AS revenue_ht,
            COALESCE(SUM(COALESCE(p.purchase_price_ht, 0) * sl.quantity), 0)::text AS cost_ht,
            COALESCE(SUM(sl.quantity), 0)::text AS items_sold
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
      GROUP BY s.store_id`,
    [orgId, from, to],
  );

  let prevCaByStore = new Map<string, number>();
  if (prev_from && prev_to) {
    const prev = await query<{ store_id: string; ca_ttc: string }>(
      `SELECT s.store_id::text AS store_id, COALESCE(SUM(s.total_ttc), 0)::text AS ca_ttc
         FROM sales s
        WHERE s.organization_id = $1
          AND s.status = 'validated'
          AND s.validated_at::date BETWEEN $2::date AND $3::date
        GROUP BY s.store_id`,
      [orgId, prev_from, prev_to],
    );
    prevCaByStore = new Map(prev.rows.map((r) => [r.store_id, Number(r.ca_ttc)]));
  }

  const salesByStore = new Map(sales.rows.map((r) => [r.store_id, r]));
  const marginByStore = new Map(margin.rows.map((r) => [r.store_id, r]));

  const result = stores.rows.map((st) => {
    const s = salesByStore.get(st.id);
    const m = marginByStore.get(st.id);
    const ca_ttc = s ? Number(s.ca_ttc) : 0;
    const tickets_count = s ? s.tickets_count : 0;
    const revenue_ht = m ? Number(m.revenue_ht) : 0;
    const cost_ht = m ? Number(m.cost_ht) : 0;
    const marge_ht = Number((revenue_ht - cost_ht).toFixed(2));
    const marge_pct = revenue_ht > 0 ? Number(((marge_ht / revenue_ht) * 100).toFixed(1)) : 0;
    const items_sold = m ? Number(m.items_sold) : 0;
    const avg_ticket_ttc = tickets_count > 0 ? Number((ca_ttc / tickets_count).toFixed(2)) : 0;
    const prevCa = prevCaByStore.get(st.id) ?? null;
    const growth_pct = prevCa !== null && prevCa > 0
      ? Number((((ca_ttc - prevCa) / prevCa) * 100).toFixed(1))
      : null;
    return {
      store_id: st.id,
      store_name: st.name,
      ca_ttc,
      tickets_count,
      avg_ticket_ttc,
      marge_ht,
      marge_pct,
      items_sold,
      growth_pct,
    };
  });

  return NextResponse.json({ stores: result });
}
