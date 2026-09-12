import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { reportRange, localDay } from '@/lib/reports/range';

export const dynamic = 'force-dynamic';

/**
 * Remises accordées sur la période : montant total, taux, classement par motif,
 * et la liste des ventes remisées.
 *
 * Le MOTIF d'une remise manuelle n'existe qu'au niveau LIGNE, dans
 * `sale_lines.metadata` (`cart_discount_reason` pour une remise globale panier,
 * répliquée sur chaque ligne ; `manual_discount_reason` pour une remise ligne).
 * Le montant, lui, est agrégé sur `sales.total_discount`. Les remises
 * automatiques (remise client) et les promos produit portent un montant SANS
 * motif : on les regroupe alors sous « Sans motif ».
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const range = reportRange(req, g.user.organizationId);
  if ('response' in range) return range.response;
  const { storeId, args } = range;
  const storeFilter = storeId ? 'AND s.store_id = $4' : '';
  const DAY = localDay('s.validated_at');

  // KPIs (niveau vente).
  const totalsRes = await query<{
    total_discount: string; total_ttc: string; discounted: string; sales: string;
  }>(
    `SELECT COALESCE(SUM(s.total_discount), 0)::text AS total_discount,
            COALESCE(SUM(s.total_ttc), 0)::text     AS total_ttc,
            COUNT(*) FILTER (WHERE s.total_discount > 0)::text AS discounted,
            COUNT(*)::text AS sales
       FROM sales s
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND ${DAY} BETWEEN $2::date AND $3::date
        ${storeFilter}`,
    args,
  );

  // Classement par motif (niveau ligne : le motif y est natif).
  // Priorité : justification manuelle (texte saisi, ex. « Geste commercial ») >
  // remise fidélité > remise client (remise systématique automatique). Le reste
  // (promos produit sans trace) reste sans motif.
  const byReasonRes = await query<{ motif: string | null; total: string; ventes: string }>(
    `SELECT COALESCE(
              NULLIF(sl.metadata->>'cart_discount_reason', ''),
              NULLIF(sl.metadata->>'manual_discount_reason', ''),
              CASE WHEN (sl.metadata->>'loyalty_discount') = 'true' THEN 'Remise fidélité' END,
              CASE WHEN COALESCE(NULLIF(sl.metadata->>'auto_discount_pct', '')::numeric, 0) > 0
                   THEN 'Remise client' END
            ) AS motif,
            SUM(sl.discount_amount)::text AS total,
            COUNT(DISTINCT s.id)::text    AS ventes
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND ${DAY} BETWEEN $2::date AND $3::date
        AND sl.discount_amount > 0
        ${storeFilter}
      GROUP BY 1
      ORDER BY SUM(sl.discount_amount) DESC`,
    args,
  );

  // Liste des ventes remisées (motif dérivé des lignes).
  const rowsRes = await query<{
    id: string; receipt: string | null; date: string;
    cashier: string | null; customer: string | null; store: string | null;
    discount: string; ttc: string; motif: string | null;
  }>(
    `SELECT s.id, s.receipt_number AS receipt, s.validated_at::text AS date,
            u.full_name AS cashier,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer,
            st.name AS store,
            s.total_discount::text AS discount, s.total_ttc::text AS ttc,
            m.motif
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN stores st ON st.id = s.store_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(
                  MAX(NULLIF(sl.metadata->>'cart_discount_reason', '')),
                  MAX(NULLIF(sl.metadata->>'manual_discount_reason', '')),
                  CASE WHEN bool_or((sl.metadata->>'loyalty_discount') = 'true')
                       THEN 'Remise fidélité' END,
                  CASE WHEN bool_or(COALESCE(NULLIF(sl.metadata->>'auto_discount_pct', '')::numeric, 0) > 0)
                       THEN 'Remise client' END
                ) AS motif
           FROM sale_lines sl WHERE sl.sale_id = s.id
       ) m ON TRUE
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND ${DAY} BETWEEN $2::date AND $3::date
        AND s.total_discount > 0
        ${storeFilter}
      ORDER BY s.validated_at DESC
      LIMIT 500`,
    args,
  );

  const t = totalsRes.rows[0]!;
  const totalDiscount = Number(t.total_discount);
  const totalTtc = Number(t.total_ttc);
  const gross = totalTtc + totalDiscount; // CA brut avant remise
  const discounted = Number(t.discounted);

  return NextResponse.json({
    totals: {
      total_discount: totalDiscount,
      discounted_sales: discounted,
      sales: Number(t.sales),
      // Part du CA brut « laissée » en remise sur la période.
      rate: gross > 0 ? totalDiscount / gross : 0,
      avg_per_discounted: discounted > 0 ? totalDiscount / discounted : 0,
    },
    by_reason: byReasonRes.rows.map((r) => ({
      motif: r.motif,
      total: Number(r.total),
      ventes: Number(r.ventes),
    })),
    rows: rowsRes.rows.map((r) => {
      const disc = Number(r.discount);
      const ttc = Number(r.ttc);
      const g2 = ttc + disc;
      return {
        id: r.id, receipt: r.receipt, date: r.date,
        cashier: r.cashier, customer: r.customer, store: r.store,
        discount: disc, ttc, rate: g2 > 0 ? disc / g2 : 0, motif: r.motif,
      };
    }),
  });
}
