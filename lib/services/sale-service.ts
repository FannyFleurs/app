import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';
import {
  computeLine,
  computeTotals,
  type LineComputed,
} from './money';
import { loyaltyGroupKey, type LoyaltySettings } from '@/lib/settings/pos-ui';
import { loyaltyGroupReady } from './loyalty-schema';
import type { PoolClient } from 'pg';

export interface SaleLineInput {
  product_id?: string | null;
  variant_id?: string | null;
  label: string;
  unit_price_ttc: number;
  quantity: number;
  discount_amount?: number;
  tax_rate: number;
  tax_rate_code: string;
  metadata?: Record<string, unknown>;
}

export interface SalePaymentInput {
  method:
    | 'cash'
    | 'card'
    | 'check'
    | 'transfer'
    | 'gift_card'
    | 'credit_note'
    | 'deferred'
    | 'other';
  amount: number;
  given_amount?: number;
  reference?: string;
}

export interface CreateDraftArgs {
  organizationId: string;
  storeId: string;
  registerId: string;
  userId: string;
  customerId?: string | null;
  /** Ventes hors-ligne : idempotence + horodatage réel de l'encaissement. */
  clientRef?: string | null;
  occurredAt?: string | null;
}

export class SaleService {
  /** Crée un panier brouillon. Une vente est rattachée à la session caisse ouverte. */
  static async createDraft(args: CreateDraftArgs): Promise<{ id: string }> {
    return withTransaction(async (client) => {
      const session = await client.query<{ id: string }>(
        `SELECT id FROM cash_sessions
          WHERE register_id = $1 AND status = 'open'
          ORDER BY opened_at DESC LIMIT 1`,
        [args.registerId],
      );
      if (session.rowCount === 0) {
        const err = new Error('NO_OPEN_CASH_SESSION');
        (err as Error & { status?: number }).status = 400;
        throw err;
      }

      const res = await client.query<{ id: string }>(
        `INSERT INTO sales
           (organization_id, store_id, register_id, cash_session_id, user_id, customer_id, status,
            client_ref, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8)
         RETURNING id`,
        [
          args.organizationId,
          args.storeId,
          args.registerId,
          session.rows[0]!.id,
          args.userId,
          args.customerId ?? null,
          args.clientRef ?? null,
          args.occurredAt ?? null,
        ],
      );
      return { id: res.rows[0]!.id };
    });
  }

  /** Remplace les lignes du panier (recalcule les totaux). */
  static async setLines(
    saleId: string,
    organizationId: string,
    lines: SaleLineInput[],
  ): Promise<{ totals: ReturnType<typeof computeTotals> }> {
    return withTransaction(async (client) => {
      const saleRes = await client.query<{ status: string }>(
        `SELECT status FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [saleId, organizationId],
      );
      if (saleRes.rowCount === 0) throw new Error('SALE_NOT_FOUND');
      if (saleRes.rows[0]!.status !== 'draft' && saleRes.rows[0]!.status !== 'on_hold') {
        throw new Error('SALE_NOT_EDITABLE');
      }

      const computed: LineComputed[] = lines.map((l) =>
        computeLine({
          unitPriceTtc: l.unit_price_ttc,
          quantity: l.quantity,
          discountAmount: l.discount_amount,
          taxRate: l.tax_rate,
        }),
      );
      const totals = computeTotals(computed);

      await client.query(`DELETE FROM sale_lines WHERE sale_id = $1`, [saleId]);
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        const c = computed[i]!;
        await client.query(
          `INSERT INTO sale_lines
            (organization_id, sale_id, line_index, product_id, variant_id,
             label, unit_price_ttc, quantity, discount_amount,
             tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            organizationId,
            saleId,
            i,
            l.product_id ?? null,
            l.variant_id ?? null,
            l.label,
            c.unit_price_ttc,
            c.quantity,
            c.discount_amount,
            c.tax_rate,
            l.tax_rate_code,
            c.line_ht,
            c.line_tva,
            c.line_ttc,
            JSON.stringify(l.metadata ?? {}),
          ],
        );
      }

      await client.query(
        `UPDATE sales SET
           total_ht = $2, total_tva = $3, total_ttc = $4,
           total_discount = $5, tva_breakdown = $6, updated_at = now()
         WHERE id = $1`,
        [
          saleId,
          totals.total_ht,
          totals.total_tva,
          totals.total_ttc,
          totals.total_discount,
          JSON.stringify(totals.tva_breakdown),
        ],
      );

      return { totals };
    });
  }

  /** Met le panier en attente avec un libellé. */
  static async hold(saleId: string, organizationId: string, label: string) {
    return withTransaction(async (client) => {
      await client.query(
        `UPDATE sales SET status = 'on_hold', held_label = $3, updated_at = now()
         WHERE id = $1 AND organization_id = $2 AND status IN ('draft','on_hold')`,
        [saleId, organizationId, label],
      );
    });
  }

  /**
   * Encaisse une vente :
   *   1. lock + validations
   *   2. insertion paiements (vérification somme = total_ttc)
   *   3. réservation du numéro de ticket
   *   4. FiscalCore.recordEvent (hash chain, grand total)
   *   5. snapshot ticket dans receipts
   *   6. passage status = validated
   */
  static async validate(args: {
    saleId: string;
    organizationId: string;
    userId: string;
    payments: SalePaymentInput[];
    /** Si > 0, somme en € débitée du compte fidélité du client */
    loyaltyRedemptionAmount?: number;
  }): Promise<{
    saleId: string;
    receiptNumber: string;
    fiscalHash: string;
    fiscalEventId: string;
    receiptId: string;
    snapshot: Record<string, unknown>;
    loyalty?: { earned: number; redeemed: number; new_balance: number } | null;
    stock_movements?: number;
  }> {
    return withTransaction(async (client) => {
      // 1. Lock vente + sanity checks
      const saleRes = await client.query<{
        id: string;
        organization_id: string;
        store_id: string;
        register_id: string;
        cash_session_id: string;
        customer_id: string | null;
        status: string;
        total_ttc: string;
        total_ht: string;
        total_tva: string;
        total_discount: string;
        tva_breakdown: unknown;
      }>(
        `SELECT * FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [args.saleId, args.organizationId],
      );
      if (saleRes.rowCount === 0) throw new Error('SALE_NOT_FOUND');
      const sale = saleRes.rows[0]!;
      if (sale.status === 'validated') {
        throw new Error('SALE_ALREADY_VALIDATED');
      }
      if (sale.status !== 'draft' && sale.status !== 'on_hold') {
        throw new Error('SALE_NOT_VALIDATABLE');
      }
      const totalTtc = Number(sale.total_ttc);
      if (totalTtc <= 0) throw new Error('SALE_EMPTY');

      // Vérifie la somme des paiements
      const sumPayments = args.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (Math.abs(sumPayments - totalTtc) > 0.005) {
        throw new Error('PAYMENTS_MISMATCH');
      }

      const linesRes = await client.query(
        `SELECT line_index, product_id, variant_id, label,
                unit_price_ttc, quantity, discount_amount, tax_rate, tax_rate_code,
                line_ht, line_tva, line_ttc, metadata
           FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`,
        [sale.id],
      );

      // 2. Paiements
      for (const p of args.payments) {
        // Pré-validation et débit des avoirs et cartes cadeaux
        if (p.method === 'credit_note') {
          if (!p.reference) throw new Error('CREDIT_NOTE_REFERENCE_REQUIRED');
          const cnRes = await client.query<{
            id: string; amount: string; used_amount: string; status: string;
          }>(
            `SELECT id, amount::text, used_amount::text, status
               FROM credit_notes
              WHERE organization_id = $1 AND number = $2 FOR UPDATE`,
            [args.organizationId, p.reference],
          );
          if (cnRes.rowCount === 0) throw new Error('CREDIT_NOTE_NOT_FOUND');
          const cn = cnRes.rows[0]!;
          if (cn.status === 'used' || cn.status === 'cancelled') {
            throw new Error('CREDIT_NOTE_NOT_USABLE');
          }
          const remaining = Number(cn.amount) - Number(cn.used_amount);
          if (p.amount > remaining + 0.005) throw new Error('CREDIT_NOTE_INSUFFICIENT');
          const newUsed = Number((Number(cn.used_amount) + p.amount).toFixed(2));
          const newStatus = newUsed >= Number(cn.amount) - 0.005 ? 'used' : 'partially_used';
          await client.query(
            `UPDATE credit_notes SET used_amount = $1, status = $2
              WHERE id = $3`,
            [newUsed, newStatus, cn.id],
          );
        } else if (p.method === 'gift_card') {
          if (!p.reference) throw new Error('GIFT_CARD_REFERENCE_REQUIRED');
          const gcRes = await client.query<{
            id: string; balance: string; status: string; expires_at: string | null;
          }>(
            `SELECT id, balance::text, status, expires_at
               FROM gift_cards
              WHERE organization_id = $1 AND code = $2 FOR UPDATE`,
            [args.organizationId, p.reference],
          );
          if (gcRes.rowCount === 0) throw new Error('GIFT_CARD_NOT_FOUND');
          const gc = gcRes.rows[0]!;
          if (gc.status !== 'active' && gc.status !== 'partially_used') {
            throw new Error('GIFT_CARD_NOT_USABLE');
          }
          if (gc.expires_at && new Date(gc.expires_at).getTime() < Date.now()) {
            throw new Error('GIFT_CARD_EXPIRED');
          }
          const balance = Number(gc.balance);
          if (p.amount > balance + 0.005) throw new Error('GIFT_CARD_INSUFFICIENT');
          const newBalance = Number((balance - p.amount).toFixed(2));
          const newStatus = newBalance <= 0.005 ? 'used' : 'partially_used';
          await client.query(
            `UPDATE gift_cards SET balance = $1, status = $2 WHERE id = $3`,
            [newBalance, newStatus, gc.id],
          );
          await client.query(
            `INSERT INTO gift_card_movements
               (organization_id, gift_card_id, movement_type, amount_delta,
                balance_after, sale_id, user_id)
             VALUES ($1,$2,'use',$3,$4,$5,$6)`,
            [
              args.organizationId, gc.id, -p.amount, newBalance,
              sale.id, args.userId,
            ],
          );
        }

        const change = p.given_amount != null ? Number((p.given_amount - p.amount).toFixed(2)) : null;
        await client.query(
          `INSERT INTO payments
             (organization_id, sale_id, method, amount, given_amount, change_amount, reference, user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            args.organizationId,
            sale.id,
            p.method,
            p.amount,
            p.given_amount ?? null,
            change,
            p.reference ?? null,
            args.userId,
          ],
        );

        // "En compte" (deferred) → débite le solde du client (négatif).
        // Le solde devient positif quand le client règle son ardoise plus tard.
        if (p.method === 'deferred' && sale.customer_id) {
          try {
            await client.query(
              `UPDATE customers
                  SET account_balance = COALESCE(account_balance, 0) - $2,
                      updated_at = now()
                WHERE id = $1`,
              [sale.customer_id, p.amount],
            );
          } catch {
            // Migration 0012 pas encore appliquée : on ignore silencieusement.
          }
        }
      }

      // 3. Réservation du numéro de ticket
      const fiscal = new FiscalCore(client);
      const year = new Date().getUTCFullYear();
      const { value: seqValue, formatted: receiptNumber } =
        await fiscal.nextDocumentNumber({
          organizationId: args.organizationId,
          kind: 'receipt',
          year,
          prefix: 'T',
        });

      // 4. Snapshot ticket + fiscal event
      const validatedAt = new Date().toISOString();
      const snapshot = {
        receipt_number: receiptNumber,
        validated_at: validatedAt,
        organization_id: sale.organization_id,
        store_id: sale.store_id,
        register_id: sale.register_id,
        customer_id: sale.customer_id,
        user_id: args.userId,
        totals: {
          total_ht: Number(sale.total_ht),
          total_tva: Number(sale.total_tva),
          total_ttc: Number(sale.total_ttc),
          total_discount: Number(sale.total_discount),
        },
        tva_breakdown: sale.tva_breakdown,
        lines: linesRes.rows.map((r) => ({
          line_index: r.line_index,
          product_id: r.product_id,
          variant_id: r.variant_id,
          label: r.label,
          unit_price_ttc: Number(r.unit_price_ttc),
          quantity: Number(r.quantity),
          discount_amount: Number(r.discount_amount),
          tax_rate: Number(r.tax_rate),
          tax_rate_code: r.tax_rate_code,
          line_ht: Number(r.line_ht),
          line_tva: Number(r.line_tva),
          line_ttc: Number(r.line_ttc),
          metadata: r.metadata,
        })),
        payments: args.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
        })),
      };

      const event = await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: sale.store_id,
        registerId: sale.register_id,
        userId: args.userId,
        eventType: 'SALE_VALIDATED',
        entityType: 'sale',
        entityId: sale.id,
        payload: snapshot,
        amountTtcDelta: totalTtc,
      });

      // 5. Insertion receipts (snapshot immuable)
      const receiptRes = await client.query<{ id: string }>(
        `INSERT INTO receipts
           (organization_id, sale_id, number, sequence_value, snapshot, fiscal_hash)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [
          args.organizationId,
          sale.id,
          receiptNumber,
          seqValue.toString(),
          JSON.stringify(snapshot),
          event.currentHash,
        ],
      );

      // 6. Maj vente -> validated
      await client.query(
        `UPDATE sales SET
           status = 'validated',
           receipt_number = $2,
           receipt_sequence = $3,
           validated_at = $4,
           fiscal_event_id = $5,
           fiscal_hash = $6,
           updated_at = now()
         WHERE id = $1`,
        [
          sale.id,
          receiptNumber,
          seqValue.toString(),
          validatedAt,
          event.id,
          event.currentHash,
        ],
      );

      // 7. Fidélité (auto-earn + redemption éventuelle)
      let loyaltyResult: { earned: number; redeemed: number; new_balance: number } | null = null;
      if (sale.customer_id) {
        const cfgRes = await client.query<{ value: { loyalty?: LoyaltySettings } & Partial<LoyaltySettings> }>(
          `SELECT value FROM settings WHERE organization_id = $1 AND key = 'pos_ui'`,
          [args.organizationId],
        );
        // Compat : ancien format où loyalty était au niveau racine.
        const rawVal = cfgRes.rows[0]?.value;
        const loyaltyCfg = (rawVal?.enabled !== undefined ? rawVal : rawVal?.loyalty) as Partial<LoyaltySettings> | undefined;
        const enabled = loyaltyCfg?.enabled === true;
        const earnedPer = Number(loyaltyCfg?.euros_earned ?? 0);
        const perSpent = Number(loyaltyCfg?.per_euros_spent ?? 0);
        const redeemed = Number(args.loyaltyRedemptionAmount ?? 0);
        // Groupe fidélité selon le périmètre configuré + boutique de la vente.
        // Repli sur le modèle historique tant que la migration 0034 (colonne
        // group_key) n'est pas appliquée : on ne casse jamais l'encaissement.
        const grouped = await loyaltyGroupReady(client);
        const groupKey = loyaltyGroupKey(loyaltyCfg, sale.store_id);

        if (enabled || redeemed > 0) {
          // S'assure que le compte fidélité (du bon groupe) existe.
          let accId: string | null = null;
          const accSel = grouped
            ? await client.query<{ id: string; points_balance: number }>(
                `SELECT id, points_balance FROM loyalty_accounts
                  WHERE customer_id = $1 AND group_key = $2 FOR UPDATE`,
                [sale.customer_id, groupKey],
              )
            : await client.query<{ id: string; points_balance: number }>(
                `SELECT id, points_balance FROM loyalty_accounts
                  WHERE customer_id = $1 FOR UPDATE`,
                [sale.customer_id],
              );
          let currentBalance = 0;
          if (accSel.rowCount === 0) {
            const accIns = grouped
              ? await client.query<{ id: string }>(
                  `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance, group_key)
                   VALUES ($1,$2,0,$3) RETURNING id`,
                  [args.organizationId, sale.customer_id, groupKey],
                )
              : await client.query<{ id: string }>(
                  `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance)
                   VALUES ($1,$2,0) RETURNING id`,
                  [args.organizationId, sale.customer_id],
                );
            accId = accIns.rows[0]!.id;
          } else {
            accId = accSel.rows[0]!.id;
            currentBalance = Number(accSel.rows[0]!.points_balance);
          }

          // Débit (redeem) en premier — on stocke en € entiers dans points_balance (1 point = 1 €)
          let balanceAfter = currentBalance;
          if (redeemed > 0) {
            const redeemedInt = Math.round(redeemed);
            if (redeemedInt > currentBalance) {
              throw new Error('LOYALTY_INSUFFICIENT_BALANCE');
            }
            balanceAfter = currentBalance - redeemedInt;
            await client.query(
              `INSERT INTO loyalty_movements
                 (organization_id, account_id, movement_type, points_delta,
                  balance_after, reason, source_type, source_id, user_id)
               VALUES ($1,$2,'redeem',$3,$4,$5,'sale',$6,$7)`,
              [
                args.organizationId, accId, -redeemedInt, balanceAfter,
                `Utilisation fidélité sur ticket ${receiptNumber}`,
                sale.id, args.userId,
              ],
            );
          }

          // Crédit (earn) basé sur la règle.
          // Les lignes de produits no_discount (cartes cadeaux notamment) ne
          // génèrent PAS de fidélité (pas de double-rémunération : la fidélité
          // sera générée à l'utilisation de la carte cadeau, comme un paiement
          // normal).
          let earnedInt = 0;
          if (enabled && earnedPer > 0 && perSpent > 0) {
            const productIds = linesRes.rows
              .map((l: { product_id: string | null }) => l.product_id)
              .filter(Boolean) as string[];
            let noLoyaltyIds = new Set<string>();
            if (productIds.length > 0) {
              try {
                const ndRes = await client.query<{ id: string }>(
                  `SELECT id FROM products
                    WHERE id = ANY($1::uuid[]) AND COALESCE(no_discount, FALSE) = TRUE`,
                  [productIds],
                );
                noLoyaltyIds = new Set(ndRes.rows.map((r) => r.id));
              } catch { /* colonne no_discount absente : ignore */ }
            }
            const eligibleTtc = linesRes.rows.reduce((s: number, l: {
              product_id: string | null; line_ttc: string;
            }) => {
              if (l.product_id && noLoyaltyIds.has(l.product_id)) return s;
              return s + Number(l.line_ttc);
            }, 0);
            earnedInt = Math.floor((eligibleTtc / perSpent) * earnedPer);
            if (earnedInt > 0) {
              balanceAfter = balanceAfter + earnedInt;
              await client.query(
                `INSERT INTO loyalty_movements
                   (organization_id, account_id, movement_type, points_delta,
                    balance_after, reason, source_type, source_id, user_id)
                 VALUES ($1,$2,'earn',$3,$4,$5,'sale',$6,$7)`,
                [
                  args.organizationId, accId, earnedInt, balanceAfter,
                  `Achat ticket ${receiptNumber}`,
                  sale.id, args.userId,
                ],
              );
            }
          }

          if (redeemed > 0 || earnedInt > 0) {
            await client.query(
              `UPDATE loyalty_accounts SET points_balance = $1, updated_at = now()
                WHERE id = $2`,
              [balanceAfter, accId],
            );
            loyaltyResult = {
              earned: earnedInt,
              redeemed: Math.round(redeemed),
              new_balance: balanceAfter,
            };
          }
        }
      }

      // 8. Décrément stock pour les produits suivis
      let stockMovementCount = 0;
      const lineProductRes = await client.query<{
        product_id: string; variant_id: string | null; quantity: string;
        track_stock: boolean;
      }>(
        `SELECT sl.product_id, sl.variant_id, sl.quantity, p.track_stock
           FROM sale_lines sl
           JOIN products p ON p.id = sl.product_id
          WHERE sl.sale_id = $1 AND sl.product_id IS NOT NULL`,
        [sale.id],
      );
      for (const line of lineProductRes.rows) {
        if (!line.track_stock) continue;
        const qty = Number(line.quantity);
        // Lit (avec verrou) ou crée le niveau de stock pour ce store / produit
        // / variant. IMPORTANT : `variant_id` peut être NULL et un ON CONFLICT
        // sur (store_id, product_id, variant_id) ne matche JAMAIS quand
        // variant_id est NULL (les NULL SQL sont distincts) — ce qui créait un
        // nouveau niveau à 0 à chaque vente et ne débitait jamais le vrai
        // stock. On utilise donc `IS NOT DISTINCT FROM` + FOR UPDATE.
        const existing = await client.query<{ id: string; quantity: string }>(
          `SELECT id, quantity FROM stock_levels
            WHERE store_id = $1 AND product_id = $2
              AND variant_id IS NOT DISTINCT FROM $3
            FOR UPDATE`,
          [sale.store_id, line.product_id, line.variant_id],
        );
        let levelId: string;
        let prev: number;
        if (existing.rows[0]) {
          levelId = existing.rows[0].id;
          prev = Number(existing.rows[0].quantity);
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO stock_levels (organization_id, store_id, product_id, variant_id, quantity)
             VALUES ($1,$2,$3,$4,0) RETURNING id`,
            [args.organizationId, sale.store_id, line.product_id, line.variant_id],
          );
          levelId = ins.rows[0]!.id;
          prev = 0;
        }
        const next = prev - qty;
        await client.query(
          `UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE id = $2`,
          [next, levelId],
        );
        await client.query(
          `INSERT INTO stock_movements
             (organization_id, store_id, product_id, variant_id,
              movement_type, quantity_delta, previous_quantity, new_quantity,
              reason, source_type, source_id, user_id)
           VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,$8,'sale',$9,$10)`,
          [
            args.organizationId, sale.store_id, line.product_id, line.variant_id,
            -qty, prev, next, `Vente ticket ${receiptNumber}`,
            sale.id, args.userId,
          ],
        );
        stockMovementCount++;
      }

      return {
        saleId: sale.id,
        receiptNumber,
        fiscalHash: event.currentHash,
        fiscalEventId: event.id,
        receiptId: receiptRes.rows[0]!.id,
        snapshot,
        loyalty: loyaltyResult,
        stock_movements: stockMovementCount,
      };
    });
  }

  static async listHeld(organizationId: string, registerId: string) {
    const { rows } = await withTransaction(async (client: PoolClient) =>
      client.query(
        `SELECT id, held_label, total_ttc, created_at
           FROM sales
          WHERE organization_id = $1 AND register_id = $2 AND status = 'on_hold'
          ORDER BY created_at DESC`,
        [organizationId, registerId],
      ),
    );
    return rows;
  }
}
