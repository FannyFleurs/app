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
      // 0. Refuse si déjà clôturé
      const existing = await client.query(
        `SELECT id FROM daily_closures
          WHERE store_id = $1 AND business_date = $2`,
        [args.storeId, args.businessDate],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new Error('DAILY_CLOSURE_ALREADY_SEALED');
      }

      // 1. Cumuls de la journée (ventes validées de la boutique)
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
            AND validated_at::date = $2::date`,
        [args.storeId, args.businessDate],
      );
      const totals = totalsRes.rows[0]!;

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
          GROUP BY sl.tax_rate
          ORDER BY sl.tax_rate DESC`,
        [args.storeId, args.businessDate],
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
          GROUP BY p.method
          ORDER BY p.method`,
        [args.storeId, args.businessDate],
      );
      const paymentsBreakdown = payRes.rows.map((r) => ({
        method: r.method,
        total: Number(r.total),
      }));

      const cashExpected = Number(
        paymentsBreakdown.find((p) => p.method === 'cash')?.total ?? 0,
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
      const payload = {
        store_id: args.storeId,
        business_date: args.businessDate,
        totals: {
          total_sales: Number(totals.total_sales),
          total_ht: Number(totals.total_ht),
          total_tva: Number(totals.total_tva),
          total_ttc: Number(totals.total_ttc),
          total_discount: Number(totals.total_discount),
        },
        tva_breakdown: tvaBreakdown,
        payments_breakdown: paymentsBreakdown,
        cash_expected: cashExpected,
        cash_counted: args.countedCash ?? null,
        cash_variance: cashVariance,
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
            grand_total_ttc_running, fiscal_hash, previous_hash, fiscal_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
          JSON.stringify(paymentsBreakdown),
          Number(totals.total_discount),
          cashExpected,
          args.countedCash ?? null,
          cashVariance,
          previousGrandTotal,
          event.currentHash,
          previousHash,
          event.id,
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
