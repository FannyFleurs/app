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

  // Dernière clôture de la journée + détection d'une RÉOUVERTURE : y a-t-il de
  // l'activité (ventes validées ou session ouverte) APRÈS ce scellement ?
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
  // Période courante à compter : après le dernier scellement si réouvert.
  const periodStart: string | null = reopened && lastSeal ? lastSeal.sealed_at : null;

  const totals = await query<{
    sales: string; ht: string; tva: string; ttc: string; discount: string;
  }>(
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

  // Fonds + mouvements espèces du jour pour la boutique
  // Les ins/outs filtrent par cm.created_at::date pour être cohérents avec
  // la détection des remises en banque (session ouverte la veille acceptée).
  const cashBd = await query<{
    opening_floats: string; ins: string; outs: string;
  }>(
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
  const cashSales = Number(payments.rows.find((p) => p.method === 'cash')?.total ?? 0);

  // Remises en banque = sorties dont le motif contient "banque" (case-insensitive)
  // Filtre par date du mouvement (cm.created_at) pour couvrir le cas où la
  // session a été ouverte la veille mais la remise faite le jour J.
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

  // Mouvements détaillés (pour affichage)
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

  // « Scellé » = il existe une clôture ET la journée n'a PAS été rouverte
  // depuis. Si rouverte (activité après le dernier scellement), on renvoie
  // null → l'UI débloque le comptage de la nouvelle période.
  const sealedRow = !reopened && lastSeal
    ? { id: lastSeal.id, sealed_at: lastSeal.sealed_at }
    : null;

  // Paniers encore en attente sur la boutique
  const held = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM sales
      WHERE store_id = $1 AND status = 'on_hold'`,
    [storeId],
  );
  const heldCount = Number(held.rows[0]?.c ?? 0);

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
      bank_deposits: bankDeposits,
      expected: cashExpected,
    },
    movements: movements.rows.map((m) => ({
      id: m.id, movement_type: m.movement_type,
      amount: Number(m.amount), reason: m.reason,
      created_at: m.created_at,
    })),
    sealed: sealedRow,
    reopened,
    held_count: heldCount,
  });
}
