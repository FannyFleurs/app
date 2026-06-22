import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

/**
 * Renvoie les totaux calculés pour une date de clôture donnée (sans rien sceller).
 * Utilisé par l'UI de clôture pour afficher ce qui va être figé.
 */
export async function GET(req: Request) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const date = url.searchParams.get('date');
  if (!storeId || !date) return jsonError('store_id et date requis', 400);

  const totals = await query<{
    sales: string; ht: string; tva: string; ttc: string; discount: string;
  }>(
    `SELECT COUNT(*)::text AS sales,
            COALESCE(SUM(total_ht),0)::text  AS ht,
            COALESCE(SUM(total_tva),0)::text AS tva,
            COALESCE(SUM(total_ttc),0)::text AS ttc,
            COALESCE(SUM(total_discount),0)::text AS discount
       FROM sales
      WHERE store_id = $1 AND status='validated' AND validated_at::date = $2::date`,
    [storeId, date],
  );

  const tvaBreakdown = await query<{ rate: string; base_ht: string; tva: string; ttc: string }>(
    `SELECT sl.tax_rate::text AS rate,
            SUM(sl.line_ht)::text AS base_ht,
            SUM(sl.line_tva)::text AS tva,
            SUM(sl.line_ttc)::text AS ttc
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.store_id = $1 AND s.status='validated' AND s.validated_at::date = $2::date
      GROUP BY sl.tax_rate ORDER BY sl.tax_rate DESC`,
    [storeId, date],
  );

  const payments = await query<{ method: string; total: string }>(
    `SELECT p.method, SUM(p.amount)::text AS total
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
      WHERE s.store_id = $1 AND s.status='validated' AND s.validated_at::date = $2::date
      GROUP BY p.method ORDER BY p.method`,
    [storeId, date],
  );

  // Fonds + mouvements espèces du jour pour la boutique
  const cashBd = await query<{
    opening_floats: string; ins: string; outs: string;
  }>(
    `SELECT
        COALESCE(SUM(cs.opening_float), 0)::text AS opening_floats,
        COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
                   WHERE cm.cash_session_id IN (
                     SELECT id FROM cash_sessions
                      WHERE store_id = $1 AND opened_at::date = $2::date
                   ) AND cm.movement_type = 'in'), 0)::text AS ins,
        COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
                   WHERE cm.cash_session_id IN (
                     SELECT id FROM cash_sessions
                      WHERE store_id = $1 AND opened_at::date = $2::date
                   ) AND cm.movement_type = 'out'), 0)::text AS outs
       FROM cash_sessions cs
      WHERE cs.store_id = $1 AND cs.opened_at::date = $2::date`,
    [storeId, date],
  );
  const openingFloats = Number(cashBd.rows[0]?.opening_floats ?? 0);
  const cashIns = Number(cashBd.rows[0]?.ins ?? 0);
  const cashOuts = Number(cashBd.rows[0]?.outs ?? 0);
  const cashSales = Number(payments.rows.find((p) => p.method === 'cash')?.total ?? 0);
  const cashExpected = Number((openingFloats + cashSales + cashIns - cashOuts).toFixed(2));

  // Mouvements détaillés (pour affichage)
  const movements = await query<{
    id: string; movement_type: 'in' | 'out'; amount: string; reason: string; created_at: string;
  }>(
    `SELECT cm.id, cm.movement_type, cm.amount::text, cm.reason, cm.created_at
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.store_id = $1 AND cs.opened_at::date = $2::date
      ORDER BY cm.created_at DESC`,
    [storeId, date],
  );

  // Vérifie si déjà clôturé
  const sealed = await query<{ id: string; sealed_at: string }>(
    `SELECT id, sealed_at FROM daily_closures
      WHERE store_id = $1 AND business_date = $2`,
    [storeId, date],
  );

  return NextResponse.json({
    totals: {
      sales: Number(totals.rows[0]!.sales),
      ht: Number(totals.rows[0]!.ht),
      tva: Number(totals.rows[0]!.tva),
      ttc: Number(totals.rows[0]!.ttc),
      discount: Number(totals.rows[0]!.discount),
    },
    tva_breakdown: tvaBreakdown.rows.map((r) => ({
      rate: Number(r.rate),
      base_ht: Number(r.base_ht),
      tva: Number(r.tva),
      ttc: Number(r.ttc),
    })),
    payments: payments.rows.map((r) => ({ method: r.method, total: Number(r.total) })),
    cash_breakdown: {
      opening_floats: openingFloats,
      cash_sales: cashSales,
      cash_in: cashIns,
      cash_out: cashOuts,
      expected: cashExpected,
    },
    movements: movements.rows.map((m) => ({
      id: m.id, movement_type: m.movement_type,
      amount: Number(m.amount), reason: m.reason,
      created_at: m.created_at,
    })),
    sealed: sealed.rows[0] ?? null,
  });
}
