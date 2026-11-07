import { query } from '@/lib/db/client';
import { depositReasonSql } from '@/lib/services/cash-deposit';
import { EXCLUDE_GIFT_CARD_ISSUANCE_SQL } from '@/lib/analytics/gift-card-ca';
import { SETTLEMENT_PAYMENTS_UNION_SQL } from '@/lib/analytics/account-settlements';

export interface ClosurePreview {
  totals: { sales: number; ht: number; tva: number; ttc: number; discount: number };
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  payments: { method: string; total: number; count: number }[];
  cash_breakdown: {
    opening_floats: number; cash_sales: number; cash_in: number;
    cash_out: number; bank_deposits: number; expected: number;
  };
  movements: { id: string; movement_type: 'in' | 'out'; amount: number; reason: string; created_at: string }[];
  // Une fois scellée, on renvoie les montants espèces FIGÉS à la clôture
  // (comptés / attendu / écart réels), pour que l'écran affiche l'écart validé
  // et non un écart recalculé à partir d'un comptage remis à zéro.
  sealed: {
    id: string; sealed_at: string;
    cash_counted: number; cash_variance: number; cash_expected: number;
  } | null;
  reopened: boolean;
  held_count: number;
}

/**
 * Résout la BORNE EXACTE (store_id, date) d'une clôture — dernier scellé le
 * cas échéant, « journée rouverte » si des ventes/sessions sont postérieures
 * à ce scellé. Partagé par `computeClosurePreview` ET `listClosurePayments`
 * (détail des paiements d'un mode, voir plus bas) : les deux DOIVENT utiliser
 * exactement la même borne, sinon le détail affiché ne somme plus au total
 * annoncé par la réconciliation.
 */
export async function resolveClosurePeriod(
  storeId: string, date: string,
): Promise<{ periodStart: string | null; reopened: boolean }> {
  const lastClose = await query<{ id: string; sealed_at: string; seq: number }>(
    `SELECT id, sealed_at, seq
       FROM daily_closures
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
  return { periodStart: reopened && lastSeal ? lastSeal.sealed_at : null, reopened };
}

/**
 * Totaux d'une clôture pour une (boutique, date) — SANS rien sceller.
 * Partagé par l'API `/api/closures/daily/preview` ET la page de clôture
 * (rendu serveur : la page arrive déjà remplie, sans dépendre d'un fetch
 * client qui, dans certains contextes desktop/webview, ne se peignait qu'après
 * un clic). Toutes les requêtes sont filtrées par store_id (unique par org).
 */
export async function computeClosurePreview(storeId: string, date: string): Promise<ClosurePreview> {
  const lastClose = await query<{
    id: string; sealed_at: string; seq: number;
    cash_counted: string | null; cash_variance: string | null; cash_expected: string | null;
  }>(
    `SELECT id, sealed_at, seq,
            cash_counted::text, cash_variance::text, cash_expected::text
       FROM daily_closures
      WHERE store_id = $1 AND business_date = $2
      ORDER BY seq DESC LIMIT 1`,
    [storeId, date],
  );
  const lastSeal = lastClose.rows[0] ?? null;
  const { periodStart, reopened } = await resolveClosurePeriod(storeId, date);

  // ht/tva/ttc/discount calculés depuis sale_lines (PAS sales.total_*), pour
  // EXCLURE les lignes d'émission de carte cadeau / bon d'achat — dette
  // envers le client, pas du CA tant qu'elles ne sont pas dépensées (voir
  // lib/analytics/gift-card-ca.ts). Même règle que la clôture SCELLÉE
  // (ClosingService.sealDaily) : sans ça, cet aperçu annonçait un CA
  // différent de celui que la clôture produirait réellement pour ce jour.
  const totals = await query<{ sales: string; ht: string; tva: string; ttc: string; discount: string }>(
    `SELECT COUNT(DISTINCT s.id)::text AS sales,
            COALESCE(SUM(sl.line_ht)  FILTER (WHERE ${EXCLUDE_GIFT_CARD_ISSUANCE_SQL}), 0)::text AS ht,
            COALESCE(SUM(sl.line_tva) FILTER (WHERE ${EXCLUDE_GIFT_CARD_ISSUANCE_SQL}), 0)::text AS tva,
            COALESCE(SUM(sl.line_ttc) FILTER (WHERE ${EXCLUDE_GIFT_CARD_ISSUANCE_SQL}), 0)::text AS ttc,
            COALESCE(SUM(sl.discount_amount) FILTER (WHERE ${EXCLUDE_GIFT_CARD_ISSUANCE_SQL}), 0)::text AS discount
       FROM sales s
       LEFT JOIN sale_lines sl ON sl.sale_id = s.id
      WHERE s.store_id = $1 AND s.status='validated' AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = $2::date
        AND ($3::timestamptz IS NULL OR s.validated_at > $3)`,
    [storeId, date, periodStart],
  );

  const tvaBreakdown = await query<{ rate: string; base_ht: string; tva: string; ttc: string }>(
    `SELECT sl.tax_rate::text AS rate,
            SUM(sl.line_ht)::text AS base_ht,
            SUM(sl.line_tva)::text AS tva,
            SUM(sl.line_ttc)::text AS ttc
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.store_id = $1 AND s.status='validated' AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = $2::date
        AND ($3::timestamptz IS NULL OR s.validated_at > $3)
        AND ${EXCLUDE_GIFT_CARD_ISSUANCE_SQL}
      GROUP BY sl.tax_rate ORDER BY sl.tax_rate DESC`,
    [storeId, date, periodStart],
  );

  // Paiements de vente DU JOUR + règlements de solde « en compte » encaissés
  // le même jour (hors espèces, déjà comptées via cash_movements ci-dessous)
  // — voir lib/analytics/account-settlements.ts. Le nombre de transactions
  // (count) sert à afficher « N CB » à côté du montant carte sur l'écran de
  // validation de clôture.
  const payments = await query<{ method: string; total: string; count: string }>(
    `SELECT method, SUM(amount)::text AS total, COUNT(*)::text AS count FROM (
       SELECT p.method AS method, p.amount AS amount
         FROM payments p
         JOIN sales s ON s.id = p.sale_id
        WHERE s.store_id = $1 AND s.status='validated' AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = $2::date
          AND ($3::timestamptz IS NULL OR s.validated_at > $3)
       UNION ALL
       ${SETTLEMENT_PAYMENTS_UNION_SQL}
     ) combined
     GROUP BY method ORDER BY method`,
    [storeId, date, periodStart],
  );

  const cashBd = await query<{ opening_floats: string; ins: string; outs: string }>(
    `SELECT
        COALESCE(SUM(cs.opening_float), 0)::text AS opening_floats,
        COALESCE((
          SELECT SUM(cm.amount) FROM cash_movements cm
           JOIN cash_sessions cs2 ON cs2.id = cm.cash_session_id
          WHERE cs2.store_id = $1
            AND (cm.created_at AT TIME ZONE 'Europe/Paris')::date = $2::date
            AND ($3::timestamptz IS NULL OR cm.created_at > $3)
            AND cm.movement_type = 'in'
        ), 0)::text AS ins,
        COALESCE((
          SELECT SUM(cm.amount) FROM cash_movements cm
           JOIN cash_sessions cs2 ON cs2.id = cm.cash_session_id
          WHERE cs2.store_id = $1
            AND (cm.created_at AT TIME ZONE 'Europe/Paris')::date = $2::date
            AND ($3::timestamptz IS NULL OR cm.created_at > $3)
            AND cm.movement_type = 'out'
        ), 0)::text AS outs
       FROM cash_sessions cs
      WHERE cs.store_id = $1 AND (cs.opened_at AT TIME ZONE 'Europe/Paris')::date = $2::date
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
        AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = $2::date
        AND ($3::timestamptz IS NULL OR s.validated_at > $3)`,
    [storeId, date, periodStart],
  );
  const cashSales = Number(cashInFromSales.rows[0]?.total ?? 0);

  const depositsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cm.amount), 0)::text AS total
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.store_id = $1
        AND (cm.created_at AT TIME ZONE 'Europe/Paris')::date = $2::date
        AND ($3::timestamptz IS NULL OR cm.created_at > $3)
        AND cm.movement_type = 'out'
        AND ${depositReasonSql('cm.reason')}`,
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
      WHERE cs.store_id = $1 AND (cs.opened_at AT TIME ZONE 'Europe/Paris')::date = $2::date
        AND ($3::timestamptz IS NULL OR cs.opened_at > $3)
      ORDER BY cm.created_at DESC`,
    [storeId, date, periodStart],
  );

  const sealedRow = !reopened && lastSeal
    ? {
        id: lastSeal.id,
        sealed_at: lastSeal.sealed_at,
        cash_counted: Number(lastSeal.cash_counted ?? 0),
        cash_variance: Number(lastSeal.cash_variance ?? 0),
        cash_expected: Number(lastSeal.cash_expected ?? 0),
      }
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
    payments: payments.rows.map((r) => ({ method: r.method, total: Number(r.total), count: Number(r.count) })),
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

export interface ClosurePaymentDetail {
  id: string;
  /** Vente normale (ticket) ou règlement de solde « en compte » (pas de ticket). */
  kind: 'sale' | 'settlement';
  amount: number;
  created_at: string;
  receipt_number: string | null;
  customer_name: string | null;
  cashier_name: string | null;
  register_name: string | null;
  reference: string | null;
  label: string | null;
}

/**
 * Détail, paiement par paiement, d'un mode de règlement pour une clôture
 * (boutique, date) — pour pointer 1 à 1 les tickets lors d'un écart de
 * caisse. MÊME périmètre exact que `payments` dans `computeClosurePreview`
 * (via `resolveClosurePeriod`) : la somme de cette liste doit toujours
 * correspondre au total affiché par la réconciliation, sans quoi le détail
 * sèmerait plus de confusion qu'il n'en résout.
 */
export async function listClosurePayments(
  storeId: string, date: string, method: string,
): Promise<ClosurePaymentDetail[]> {
  const { periodStart } = await resolveClosurePeriod(storeId, date);

  const rows = await query<{
    id: string; kind: 'sale' | 'settlement'; amount: string; created_at: string;
    receipt_number: string | null; customer_name: string | null;
    cashier_name: string | null; register_name: string | null;
    reference: string | null; label: string | null;
  }>(
    `SELECT id, kind, amount::text AS amount, created_at, receipt_number,
            customer_name, cashier_name, register_name, reference, label
       FROM (
         SELECT p.id, 'sale' AS kind, p.amount AS amount, s.validated_at AS created_at,
                s.receipt_number AS receipt_number, NULL::text AS customer_name,
                u.full_name AS cashier_name, r.name AS register_name,
                p.reference AS reference, p.label AS label
           FROM payments p
           JOIN sales s ON s.id = p.sale_id
           LEFT JOIN registers r ON r.id = s.register_id
           LEFT JOIN users u ON u.id = s.user_id
          WHERE s.store_id = $1 AND s.status = 'validated' AND p.method = $4
            AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = $2::date
            AND ($3::timestamptz IS NULL OR s.validated_at > $3)
         UNION ALL
         SELECT asp.id, 'settlement' AS kind, asp.amount AS amount, asp.created_at AS created_at,
                NULL::text AS receipt_number,
                COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
                u.full_name AS cashier_name, NULL::text AS register_name,
                asp.reference AS reference, NULL::text AS label
           FROM account_settlement_payments asp
           LEFT JOIN users u ON u.id = asp.user_id
           LEFT JOIN customers c ON c.id = asp.customer_id
          WHERE asp.store_id = $1 AND asp.method = $4 AND asp.method <> 'cash'
            AND (asp.created_at AT TIME ZONE 'Europe/Paris')::date = $2::date
            AND ($3::timestamptz IS NULL OR asp.created_at > $3)
       ) combined
      ORDER BY created_at ASC`,
    [storeId, date, periodStart, method],
  );

  return rows.rows.map((r) => ({
    id: r.id, kind: r.kind, amount: Number(r.amount), created_at: r.created_at,
    receipt_number: r.receipt_number, customer_name: r.customer_name,
    cashier_name: r.cashier_name, register_name: r.register_name,
    reference: r.reference, label: r.label,
  }));
}
