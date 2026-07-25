import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';

/**
 * Service de clôture journalière.
 * Une fois scellée, la ligne daily_closures est protégée par trigger
 * append-only en base. Toute correction doit faire l'objet d'une
 * écriture corrective dans une nouvelle date d'opération.
 */
export class ClosingService {
  static async sealDaily(args: {
    organizationId: string;
    storeId: string;
    userId: string;
    businessDate: string; // 'YYYY-MM-DD'
    countedCash?: number;
    /** Totaux déclarés par l'utilisateur, méthode → montant. Comparés au système. */
    declaredPayments?: Record<string, number>;
    /** Comptage espèces par dénomination (ex { '50': 3, '20': 5, ... }) */
    denominationCount?: Record<string, number>;
    /** Notes libres du caissier. */
    notes?: string;
  }): Promise<{
    daily_closure_id: string;
    fiscal_event_id: string;
    fiscal_hash: string;
    totals: {
      total_sales: number;
      total_ht: number;
      total_tva: number;
      total_ttc: number;
      cash_expected: number;
      cash_variance: number | null;
    };
  }> {
    return withTransaction(async (client) => {
      // 0. Période à sceller. S'il existe déjà des clôtures pour cette journée
      //    (réouverture), on scelle une NOUVELLE période bornée par la dernière
      //    clôture : on ne recompte QUE les ventes postérieures à son scellement.
      const lastClose = await client.query<{ seq: number; sealed_at: string }>(
        `SELECT seq, sealed_at FROM daily_closures
          WHERE store_id = $1 AND business_date = $2
          ORDER BY seq DESC LIMIT 1`,
        [args.storeId, args.businessDate],
      );
      const periodStart: string | null = lastClose.rows[0]?.sealed_at ?? null;
      const seq = (lastClose.rows[0]?.seq ?? 0) + 1;

      // 1. Cumuls de la période (ventes validées de la boutique). Le filtre
      //    `$3 IS NULL OR validated_at > $3` borne la période après réouverture.
      const totalsRes = await client.query<{
        total_sales: string;
        total_ht: string;
        total_tva: string;
        total_ttc: string;
        total_discount: string;
      }>(
        `SELECT COUNT(*)::text AS total_sales,
                COALESCE(SUM(total_ht),0)::text  AS total_ht,
                COALESCE(SUM(total_tva),0)::text AS total_tva,
                COALESCE(SUM(total_ttc),0)::text AS total_ttc,
                COALESCE(SUM(total_discount),0)::text AS total_discount
           FROM sales
          WHERE store_id = $1
            AND status = 'validated'
            AND validated_at::date = $2::date
            AND ($3::timestamptz IS NULL OR validated_at > $3)`,
        [args.storeId, args.businessDate, periodStart],
      );
      const totals = totalsRes.rows[0]!;

      // Réouverture sans nouvelle vente : rien à sceller.
      if (seq > 1 && Number(totals.total_sales) === 0) {
        throw new Error('NOTHING_TO_SEAL');
      }

      // 2. Répartition TVA agrégée (parcours des sale_lines)
      const tvaRes = await client.query<{
        tax_rate: string;
        base_ht: string;
        tva: string;
        ttc: string;
      }>(
        `SELECT sl.tax_rate::text AS tax_rate,
                SUM(sl.line_ht)::text AS base_ht,
                SUM(sl.line_tva)::text AS tva,
                SUM(sl.line_ttc)::text AS ttc
           FROM sale_lines sl
           JOIN sales s ON s.id = sl.sale_id
          WHERE s.store_id = $1
            AND s.status = 'validated'
            AND s.validated_at::date = $2::date
            AND ($3::timestamptz IS NULL OR s.validated_at > $3)
          GROUP BY sl.tax_rate
          ORDER BY sl.tax_rate DESC`,
        [args.storeId, args.businessDate, periodStart],
      );
      const tvaBreakdown = tvaRes.rows.map((r) => ({
        rate: Number(r.tax_rate),
        base_ht: Number(r.base_ht),
        tva: Number(r.tva),
        ttc: Number(r.ttc),
      }));

      // 3. Répartition paiements
      const payRes = await client.query<{
        method: string;
        total: string;
      }>(
        `SELECT p.method, SUM(p.amount)::text AS total
           FROM payments p
           JOIN sales s ON s.id = p.sale_id
          WHERE s.store_id = $1
            AND s.status = 'validated'
            AND s.validated_at::date = $2::date
            AND ($3::timestamptz IS NULL OR s.validated_at > $3)
          GROUP BY p.method
          ORDER BY p.method`,
        [args.storeId, args.businessDate, periodStart],
      );
      const paymentsBreakdown = payRes.rows.map((r) => ({
        method: r.method,
        total: Number(r.total),
      }));

      const cashSales = Number(
        paymentsBreakdown.find((p) => p.method === 'cash')?.total ?? 0,
      );

      // Fonds + mouvements caisse pour les sessions ouvertes ce jour-là sur cette boutique
      const floatsRes = await client.query<{
        opening_floats: string; ins: string; outs: string;
      }>(
        `SELECT
            COALESCE(SUM(cs.opening_float), 0)::text AS opening_floats,
            COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
                       WHERE cm.cash_session_id IN (
                         SELECT id FROM cash_sessions
                          WHERE store_id = $1 AND opened_at::date = $2::date
                            AND ($3::timestamptz IS NULL OR opened_at > $3)
                       ) AND cm.movement_type = 'in'), 0)::text AS ins,
            COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
                       WHERE cm.cash_session_id IN (
                         SELECT id FROM cash_sessions
                          WHERE store_id = $1 AND opened_at::date = $2::date
                            AND ($3::timestamptz IS NULL OR opened_at > $3)
                       ) AND cm.movement_type = 'out'), 0)::text AS outs
           FROM cash_sessions cs
          WHERE cs.store_id = $1 AND cs.opened_at::date = $2::date
            AND ($3::timestamptz IS NULL OR cs.opened_at > $3)`,
        [args.storeId, args.businessDate, periodStart],
      );
      const openingFloats = Number(floatsRes.rows[0]?.opening_floats ?? 0);
      const cashIns = Number(floatsRes.rows[0]?.ins ?? 0);
      const cashOuts = Number(floatsRes.rows[0]?.outs ?? 0);

      const cashExpected = Number(
        (openingFloats + cashSales + cashIns - cashOuts).toFixed(2),
      );
      const cashVariance =
        args.countedCash != null
          ? Number((args.countedCash - cashExpected).toFixed(2))
          : null;

      // 4. Récupération du grand total perpétuel courant
      const stateRes = await client.query<{ grand_total_ttc: string; last_hash: string }>(
        `SELECT grand_total_ttc, last_hash FROM fiscal_chain_state
          WHERE organization_id = $1 FOR UPDATE`,
        [args.organizationId],
      );
      const previousGrandTotal = Number(stateRes.rows[0]?.grand_total_ttc ?? 0);
      const previousHash = stateRes.rows[0]?.last_hash ?? null;

      // 5. Hash de scellement via FiscalCore
      const fiscal = new FiscalCore(client);

      // Enrichit chaque ligne paiement avec le montant déclaré et l'écart éventuel.
      const enrichedPayments = paymentsBreakdown.map((p) => {
        const declared = args.declaredPayments?.[p.method];
        return declared !== undefined
          ? {
              method: p.method,
              counted: p.total,
              declared: Number(declared),
              variance: Number((declared - p.total).toFixed(2)),
            }
          : { method: p.method, counted: p.total };
      });

      const payload = {
        store_id: args.storeId,
        business_date: args.businessDate,
        seq,
        period_start: periodStart,
        totals: {
          total_sales: Number(totals.total_sales),
          total_ht: Number(totals.total_ht),
          total_tva: Number(totals.total_tva),
          total_ttc: Number(totals.total_ttc),
          total_discount: Number(totals.total_discount),
        },
        tva_breakdown: tvaBreakdown,
        payments_breakdown: enrichedPayments,
        cash_breakdown: {
          opening_floats: openingFloats,
          cash_sales: cashSales,
          cash_in: cashIns,
          cash_out: cashOuts,
          expected: cashExpected,
        },
        cash_expected: cashExpected,
        cash_counted: args.countedCash ?? null,
        cash_variance: cashVariance,
        denomination_count: args.denominationCount ?? null,
        notes: args.notes ?? null,
        grand_total_ttc_running: previousGrandTotal, // pas de delta : la clôture n'ajoute pas, elle scelle
      };

      const event = await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: args.storeId,
        userId: args.userId,
        eventType: 'DAILY_CLOSURE_SEALED',
        entityType: 'closure_daily',
        payload,
        amountTtcDelta: 0,
      });

      // 6. Insertion clôture
      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO daily_closures
           (organization_id, store_id, business_date, closed_by,
            total_sales, total_ht, total_tva, total_ttc,
            tva_breakdown, payments_breakdown, discounts_total,
            cash_expected, cash_counted, cash_variance,
            grand_total_ttc_running, fiscal_hash, previous_hash, fiscal_event_id,
            seq, period_start)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          args.organizationId,
          args.storeId,
          args.businessDate,
          args.userId,
          Number(totals.total_sales),
          Number(totals.total_ht),
          Number(totals.total_tva),
          Number(totals.total_ttc),
          JSON.stringify(tvaBreakdown),
          JSON.stringify(enrichedPayments),
          Number(totals.total_discount),
          cashExpected,
          args.countedCash ?? null,
          cashVariance,
          previousGrandTotal,
          event.currentHash,
          previousHash,
          event.id,
          seq,
          periodStart,
        ],
      );

      // 7. Ferme automatiquement les sessions caisse encore ouvertes pour
      //    cette boutique sur ce jour. Le caissier devra ROUVRIR la caisse
      //    (avec un nouveau fonds) pour reprendre la vente — pas de
      //    réutilisation accidentelle d'une session déjà clôturée.
      await client.query(
        `UPDATE cash_sessions
            SET status = 'closed',
                closed_by = $3,
                closed_at = now(),
                counted_cash = COALESCE(counted_cash, $4),
                expected_cash = COALESCE(expected_cash, $5),
                cash_variance = COALESCE(cash_variance, $6)
          WHERE organization_id = $1
            AND store_id = $2
            AND status = 'open'
            AND opened_at::date <= $7::date`,
        [
          args.organizationId, args.storeId, args.userId,
          args.countedCash ?? null,
          cashExpected,
          cashVariance,
          args.businessDate,
        ],
      );

      return {
        daily_closure_id: insertRes.rows[0]!.id,
        fiscal_event_id: event.id,
        fiscal_hash: event.currentHash,
        totals: {
          total_sales: Number(totals.total_sales),
          total_ht: Number(totals.total_ht),
          total_tva: Number(totals.total_tva),
          total_ttc: Number(totals.total_ttc),
          cash_expected: cashExpected,
          cash_variance: cashVariance,
        },
      };
    });
  }
}
