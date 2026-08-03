import { query } from '@/lib/db/client';

export interface ClosurePreview {
  totals: { sales: number; ht: number; tva: number; ttc: number; discount: number };
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  payments: { method: string; total: number }[];
  cash_breakdown: {
    opening_floats: number; cash_sales: number; cash_in: number;
    cash_out: number; bank_deposits: number; expected: number;
  };
  movements: { id: string; movement_type: 'in' | 'out'; amount: number; reason: string; created_at: string }[];
  sealed: { id: string; sealed_at: string } | null;
  reopened: boolean;
  held_count: number;
}

/**
 * Totaux d'une clôture pour une (boutique, date) — SANS rien sceller.
 * Partagé par l'API `/api/closures/daily/preview` ET la page de clôture
 * (rendu serveur : la page arrive déjà remplie, sans dépendre d'un fetch
 * client qui, dans certains contextes desktop/webview, ne se peignait qu'après
 * un clic). Toutes les requêtes sont filtrées par store_id (unique par org).
 */
export async function computeClosurePreview(storeId: string, date: string): Promise<ClosurePreview> {
  const lastClose = await query<{ id: string; sealed_at: string; seq: number }>(
    `SELECT id, sealed_at, seq FROM daily_closures
      WHERE store_id = $1 AND business_date = $2
      ORDER BY seq DESC LIMIT 1`,
    [storeId, date],
  );
  const lastSeal = lastClose.rows[0] ?? null;
  let reopened = false;
  if (lastSeal) {
    const act = await query<{ n: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM sales
           WHERE store_id = $1 AND status = 'validated' AND validated_at > $2)
       + (SELECT COUNT(*) FROM cash_sessions
           WHERE store_id = $1 AND status = 'open' AND opened_at > $2)
       )::text AS n`,
      [storeId, lastSeal.sealed_at],
    );
    reopened = Number(act.rows[0]?.n ?? 0) > 0;
  }
  const periodStart: string | null = reopened && lastSeal ? lastSeal.sealed_at : null;

  const totals = await query<{ sales: string; ht: string; tva: string; ttc: string; discount: string }>(
    `SELECT COUNT(*)::text AS sales,
            COALESCE(SUM(total_ht),0)::text  AS ht,
            COALESCE(SUM(total_tva),0)::text AS tva,
            COALESCE(SUM(total_ttc),0)::text AS ttc,
            COALESCE(SUM(total_discount),0)::text AS discount
       FROM sales
      WHERE store_id = $1 AND status='validated' AND validated_at::date = $2::date
        AND ($3::timestamptz IS NULL OR validated_at > $3)`,
    [storeId, date, periodStart],
  );

  const tvaBreakdown = await query<{ rate: string; base_ht: string; tva: string; ttc: string }>(
    `SELECT sl.tax_rate::text AS rate,
            SUM(sl.line_ht)::text AS base_ht,
            SUM(sl.line_tva)::text AS tva,
            SUM(sl.line_ttc)::text AS ttc
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.store_id = $1 AND s.status='validated' AND s.validated_at::date = $2::date
        AND ($3::timestamptz IS NULL OR s.validated_at > $3)
      GROUP BY sl.tax_rate ORDER BY sl.tax_rate DESC`,
    [storeId, date, periodStart],
  );

  const payments = await query<{ method: string; total: string }>(
    `SELECT p.method, SUM(p.amount)::text AS total
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
      WHERE s.store_id = $1 AND s.status='validated' AND s.validated_at::date = $2::date
        AND ($3::timestamptz IS NULL OR s.validated_at > $3)
      GROUP BY p.method ORDER BY p.method`,
    [storeId, date, periodStart],
  );

  const cashBd = await query<{ opening_floats: string; ins: string; outs: string }>(
    `SELECT
        COALESCE(SUM(cs.opening_float), 0)::text AS opening_floats,
        COALESCE((
          SELECT SUM(cm.amount) FROM cash_movements cm
           JOIN cash_sessions cs2 ON cs2.id = cm.cash_session_id
          WHERE cs2.store_id = $1
            AND cm.created_at::date = $2::date
            AND ($3::timestamptz IS NULL OR cm.created_at > $3)
            AND cm.movement_type = 'in'
        ), 0)::text AS ins,
        COALESCE((
          SELECT SUM(cm.amount) FROM cash_movements cm
           JOIN cash_sessions cs2 ON cs2.id = cm.cash_session_id
          WHERE cs2.store_id = $1
            AND cm.created_at::date = $2::date
            AND ($3::timestamptz IS NULL OR cm.created_at > $3)
            AND cm.movement_type = 'out'
        ), 0)::text AS outs
       FROM cash_sessions cs
      WHERE cs.store_id = $1 AND cs.opened_at::date = $2::date
        AND ($3::timestamptz IS NULL OR cs.opened_at > $3)`,
    [storeId, date, periodStart],
  );
  const openingFloats = Number(cashBd.rows[0]?.opening_floats ?? 0);
  const cashIns = Number(cashBd.rows[0]?.ins ?? 0);
  const cashOuts = Number(cashBd.rows[0]?.outs ?? 0);

  // Espèces RÉELLEMENT entrées dans le tiroir.
  // On inclut les ventes annulées après validation : l'argent est bien entré,
  // et sa restitution est tracée par un mouvement « out » (« Annulation
  // vente … ») déjà compté dans `cashOuts`. Ne retenir que la sortie
  // reviendrait à retirer deux fois la même somme et à afficher un écart
  // fantôme (une vente de 2 € encaissée puis annulée donnait −2 € attendus).
  // Distinct de `payments` ci-dessus, qui sert à la réconciliation du CA et
  // ne doit, lui, contenir que les ventes valides.
  const cashInFromSales = await query<{ total: string }>(
    `SELECT COALESCE(SUM(p.amount), 0)::text AS total
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
      WHERE s.store_id = $1
        AND p.method = 'cash'
        AND s.status IN ('validated', 'cancelled_by_credit_note')
        AND s.validated_at::date = $2::date
        AND ($3::timestamptz IS NULL OR s.validated_at > $3)`,
    [storeId, date, periodStart],
  );
  const cashSales = Number(cashInFromSales.rows[0]?.total ?? 0);

  const depositsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cm.amount), 0)::text AS total
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.store_id = $1
        AND cm.created_at::date = $2::date
        AND ($3::timestamptz IS NULL OR cm.created_at > $3)
        AND cm.movement_type = 'out'
        AND cm.reason ILIKE '%banque%'`,
    [storeId, date, periodStart],
  );
  const bankDeposits = Number(depositsRes.rows[0]?.total ?? 0);
  const cashExpected = Number((openingFloats + cashSales + cashIns - cashOuts).toFixed(2));

  const movements = await query<{
    id: string; movement_type: 'in' | 'out'; amount: string; reason: string; created_at: string;
  }>(
    `SELECT cm.id, cm.movement_type, cm.amount::text, cm.reason, cm.created_at
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.store_id = $1 AND cs.opened_at::date = $2::date
        AND ($3::timestamptz IS NULL OR cs.opened_at > $3)
      ORDER BY cm.created_at DESC`,
    [storeId, date, periodStart],
  );

  const sealedRow = !reopened && lastSeal
    ? { id: lastSeal.id, sealed_at: lastSeal.sealed_at }
    : null;

  const held = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM sales
      WHERE store_id = $1 AND status = 'on_hold'`,
    [storeId],
  );

  return {
    totals: {
      sales: Number(totals.rows[0]!.sales),
      ht: Number(totals.rows[0]!.ht),
      tva: Number(totals.rows[0]!.tva),
      ttc: Number(totals.rows[0]!.ttc),
      discount: Number(totals.rows[0]!.discount),
    },
    tva_breakdown: tvaBreakdown.rows.map((r) => ({
      rate: Number(r.rate), base_ht: Number(r.base_ht), tva: Number(r.tva), ttc: Number(r.ttc),
    })),
    payments: payments.rows.map((r) => ({ method: r.method, total: Number(r.total) })),
    cash_breakdown: {
      opening_floats: openingFloats, cash_sales: cashSales, cash_in: cashIns,
      cash_out: cashOuts, bank_deposits: bankDeposits, expected: cashExpected,
    },
    movements: movements.rows.map((m) => ({
      id: m.id, movement_type: m.movement_type,
      amount: Number(m.amount), reason: m.reason, created_at: m.created_at,
    })),
    sealed: sealedRow,
    reopened,
    held_count: Number(held.rows[0]?.c ?? 0),
  };
}
