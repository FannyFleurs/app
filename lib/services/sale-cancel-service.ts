import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';
import { round2 } from './money';
import { STOCK_TRACKED_SQL } from './stock-tracking';

/**
 * Annulation totale d'une vente validée (contre-passation complète).
 *
 * Contrairement à la « reprise d'article » (ReturnService, qui rembourse
 * partiellement selon un mode choisi), l'annulation défait la vente dans son
 * intégralité et RENVERSE chaque règlement dans son propre mode :
 *   - « en compte » (deferred) → recrédite le solde du client (dette effacée)
 *   - carte cadeau → restaure le solde de la carte + mouvement 'refund'
 *   - avoir (credit_note) → décrémente used_amount de l'avoir consommé
 *   - espèces → sortie du tiroir ouvert
 *   - carte/chèque/virement/autre → aucune écriture auto (remboursement physique)
 *   - fidélité → mouvement 'cancel' qui annule earn/redeem de la vente
 *
 * Émet un avoir (credit_notes) et un événement fiscal SALE_CANCELLED_BY_CREDIT_NOTE
 * (amountTtcDelta négatif : réduit le cumul perpétuel). La vente d'origine reste
 * immuable ; seul son statut passe à 'cancelled_by_credit_note'.
 */
export class SaleCancelService {
  static async cancelSale(args: {
    organizationId: string;
    userId: string;
    saleId: string;
    reason: string;
  }): Promise<{ credit_note_id: string; number: string; amount: number; fiscal_hash: string }> {
    if (!args.reason.trim()) throw new Error('REASON_REQUIRED');

    return withTransaction(async (client) => {
      // 1. Verrouille la vente
      const saleRes = await client.query<{
        id: string; status: string; store_id: string; register_id: string;
        cash_session_id: string | null; receipt_number: string;
        customer_id: string | null; total_ttc: string; account_invoice_id: string | null;
      }>(
        `SELECT id, status, store_id, register_id, cash_session_id, receipt_number,
                customer_id, total_ttc, account_invoice_id
           FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [args.saleId, args.organizationId],
      );
      if (saleRes.rowCount === 0) throw new Error('SALE_NOT_FOUND');
      const sale = saleRes.rows[0]!;
      if (sale.status !== 'validated') throw new Error('SALE_NOT_CANCELABLE');
      if (sale.account_invoice_id) throw new Error('SALE_INVOICED');

      // Refuse si une facture (mono-vente) a déjà été émise pour cette vente :
      // une facture validée est immuable, annuler la vente créerait une
      // incohérence. L'annulation doit alors passer par un avoir de facture.
      const invRef = await client.query(
        `SELECT 1 FROM invoices WHERE sale_id = $1 AND status <> 'cancelled' LIMIT 1`,
        [sale.id],
      );
      if (invRef.rowCount && invRef.rowCount > 0) throw new Error('SALE_INVOICED');

      // Refuse si des avoirs (reprises partielles) existent déjà : le montant a
      // déjà été partiellement contre-passé, l'annulation totale n'a plus de sens.
      const prevReturns = await client.query(
        `SELECT 1 FROM fiscal_events
          WHERE organization_id = $1 AND entity_type = 'credit_note'
            AND payload->>'origin_sale_id' = $2 LIMIT 1`,
        [args.organizationId, sale.id],
      );
      if (prevReturns.rowCount && prevReturns.rowCount > 0) throw new Error('SALE_HAS_RETURNS');

      const amount = round2(Number(sale.total_ttc));

      // 2. Lignes + paiements d'origine
      const linesRes = await client.query<{
        line_index: number; label: string; quantity: string; tax_rate: string;
        line_ttc: string; product_id: string | null; variant_id: string | null;
      }>(
        `SELECT line_index, label, quantity, tax_rate, line_ttc, product_id, variant_id
           FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`,
        [sale.id],
      );
      const paymentsRes = await client.query<{ method: string; amount: string; reference: string | null }>(
        `SELECT method, amount, reference FROM payments WHERE sale_id = $1`,
        [sale.id],
      );

      // 3. Numéro d'avoir
      const fiscal = new FiscalCore(client);
      const year = new Date().getUTCFullYear();
      const { value: seqValue, formatted: number } = await fiscal.nextDocumentNumber({
        organizationId: args.organizationId, kind: 'credit_note', year, prefix: 'A',
      });

      // 4. Insertion de l'avoir (consommé immédiatement par la contre-passation)
      const colsRes = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'credit_notes'
            AND column_name IN ('customer_id', 'refund_method')`,
      );
      const hasCustomerCol = colsRes.rows.some((r) => r.column_name === 'customer_id');
      const hasRefundCol   = colsRes.rows.some((r) => r.column_name === 'refund_method');
      let cnIns;
      if (hasCustomerCol && hasRefundCol) {
        cnIns = await client.query<{ id: string }>(
          `INSERT INTO credit_notes
             (organization_id, sale_id, customer_id, refund_method,
              number, sequence_value, amount, reason, status, used_amount, fiscal_hash)
           VALUES ($1,$2,$3,'cancellation',$4,$5,$6,$7,'used',$6,'pending')
           RETURNING id`,
          [args.organizationId, sale.id, sale.customer_id, number, seqValue.toString(), amount, args.reason.trim()],
        );
      } else {
        cnIns = await client.query<{ id: string }>(
          `INSERT INTO credit_notes
             (organization_id, sale_id, number, sequence_value, amount, reason, status, used_amount, fiscal_hash)
           VALUES ($1,$2,$3,$4,$5,$6,'used',$5,'pending')
           RETURNING id`,
          [args.organizationId, sale.id, number, seqValue.toString(), amount, args.reason.trim()],
        );
      }
      const creditNoteId = cnIns.rows[0]!.id;

      // 5. Événement fiscal (réduit le cumul perpétuel)
      const event = await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: sale.store_id,
        registerId: sale.register_id,
        userId: args.userId,
        eventType: 'SALE_CANCELLED_BY_CREDIT_NOTE',
        entityType: 'sale',
        entityId: sale.id,
        payload: {
          credit_note_id: creditNoteId,
          credit_note_number: number,
          origin_sale_id: sale.id,
          origin_receipt_number: sale.receipt_number,
          amount,
          reason: args.reason.trim(),
          is_full_return: true,
          lines: linesRes.rows.map((l) => ({
            line_index: l.line_index, label: l.label,
            quantity: Number(l.quantity), tax_rate: Number(l.tax_rate),
            refunded_ttc: round2(Number(l.line_ttc)),
          })),
          reversed_payments: paymentsRes.rows.map((p) => ({
            method: p.method, amount: round2(Number(p.amount)),
          })),
        },
        amountTtcDelta: -amount,
      });
      await client.query(`UPDATE credit_notes SET fiscal_hash = $1 WHERE id = $2`, [event.currentHash, creditNoteId]);

      // 6. Recrédit du stock (produits suivis)
      const productIds = Array.from(new Set(linesRes.rows.map((l) => l.product_id).filter((x): x is string => !!x)));
      const trackedSet = new Set<string>();
      if (productIds.length > 0) {
        const tr = await client.query<{ id: string }>(
          `SELECT p.id FROM products p
             LEFT JOIN product_categories c ON c.id = p.category_id
            WHERE p.id = ANY($1::uuid[]) AND ${STOCK_TRACKED_SQL}`,
          [productIds],
        );
        for (const row of tr.rows) trackedSet.add(row.id);
      }
      for (const l of linesRes.rows) {
        if (!l.product_id || !trackedSet.has(l.product_id)) continue;
        const qty = Number(l.quantity);
        const existing = await client.query<{ id: string; quantity: string }>(
          `SELECT id, quantity FROM stock_levels
            WHERE store_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3 FOR UPDATE`,
          [sale.store_id, l.product_id, l.variant_id],
        );
        let levelId: string; let prev: number;
        if (existing.rows[0]) { levelId = existing.rows[0].id; prev = Number(existing.rows[0].quantity); }
        else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO stock_levels (organization_id, store_id, product_id, variant_id, quantity)
             VALUES ($1,$2,$3,$4,0) RETURNING id`,
            [args.organizationId, sale.store_id, l.product_id, l.variant_id],
          );
          levelId = ins.rows[0]!.id; prev = 0;
        }
        const next = prev + qty;
        await client.query(`UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE id = $2`, [next, levelId]);
        await client.query(
          `INSERT INTO stock_movements
             (organization_id, store_id, product_id, variant_id,
              movement_type, quantity_delta, previous_quantity, new_quantity,
              reason, source_type, source_id, user_id)
           VALUES ($1,$2,$3,$4,'return',$5,$6,$7,$8,'credit_note',$9,$10)`,
          [args.organizationId, sale.store_id, l.product_id, l.variant_id, qty, prev, next,
           `Annulation vente ${sale.receipt_number}`, creditNoteId, args.userId],
        );
      }

      // 7. Contre-passation des règlements, mode par mode
      let cashSessionId: string | null = null;
      if (paymentsRes.rows.some((p) => p.method === 'cash')) {
        const openSess = await client.query<{ id: string }>(
          `SELECT id FROM cash_sessions WHERE register_id = $1 AND status = 'open'
            ORDER BY opened_at DESC LIMIT 1`,
          [sale.register_id],
        );
        cashSessionId = openSess.rows[0]?.id ?? sale.cash_session_id ?? null;
      }
      for (const p of paymentsRes.rows) {
        const amt = round2(Number(p.amount));
        if (amt <= 0) continue;
        if (p.method === 'cash' && cashSessionId) {
          await client.query(
            `INSERT INTO cash_movements
               (organization_id, cash_session_id, movement_type, amount, reason, user_id)
             VALUES ($1,$2,'out',$3,$4,$5)`,
            [args.organizationId, cashSessionId, amt, `Annulation vente ${sale.receipt_number}`, args.userId],
          );
        } else if (p.method === 'deferred' && sale.customer_id) {
          // Efface la dette « en compte » créée par la vente.
          try {
            await client.query(
              `UPDATE customers SET account_balance = COALESCE(account_balance, 0) + $2, updated_at = now()
                WHERE id = $1`,
              [sale.customer_id, amt],
            );
          } catch (e) {
            if ((e as { code?: string }).code !== '42703') throw e;
          }
        } else if (p.method === 'gift_card' && p.reference) {
          // Restaure le solde de la carte cadeau.
          const gc = await client.query<{ id: string; balance: string }>(
            `SELECT id, balance::text FROM gift_cards
              WHERE organization_id = $1 AND code = $2 FOR UPDATE`,
            [args.organizationId, p.reference],
          );
          if (gc.rowCount && gc.rows[0]) {
            const newBalance = round2(Number(gc.rows[0].balance) + amt);
            await client.query(
              `UPDATE gift_cards SET balance = $1, status = 'active' WHERE id = $2`,
              [newBalance, gc.rows[0].id],
            );
            await client.query(
              `INSERT INTO gift_card_movements
                 (organization_id, gift_card_id, movement_type, amount_delta, balance_after, sale_id, user_id)
               VALUES ($1,$2,'refund',$3,$4,$5,$6)`,
              [args.organizationId, gc.rows[0].id, amt, newBalance, sale.id, args.userId],
            );
          }
        } else if (p.method === 'credit_note' && p.reference) {
          // Rend l'avoir qui avait été consommé par la vente.
          const cn = await client.query<{ id: string; amount: string; used_amount: string }>(
            `SELECT id, amount::text, used_amount::text FROM credit_notes
              WHERE organization_id = $1 AND number = $2 FOR UPDATE`,
            [args.organizationId, p.reference],
          );
          if (cn.rowCount && cn.rows[0]) {
            const newUsed = round2(Math.max(0, Number(cn.rows[0].used_amount) - amt));
            const newStatus = newUsed <= 0.005 ? 'open' : 'partially_used';
            await client.query(
              `UPDATE credit_notes SET used_amount = $1, status = $2 WHERE id = $3`,
              [newUsed, newStatus, cn.rows[0].id],
            );
          }
        }
        // 'card' / 'check' / 'transfer' / 'other' : remboursement physique hors caisse.
      }

      // 8. Contre-passation fidélité (annule earn + redeem de la vente)
      if (sale.customer_id) {
        const lm = await client.query<{ account_id: string; net: string }>(
          `SELECT account_id, COALESCE(SUM(points_delta),0)::text AS net
             FROM loyalty_movements
            WHERE source_type = 'sale' AND source_id = $1
            GROUP BY account_id`,
          [sale.id],
        );
        for (const row of lm.rows) {
          const net = Number(row.net); // earn(+) et redeem(−) cumulés
          if (net === 0) continue;
          const accSel = await client.query<{ points_balance: string }>(
            `SELECT points_balance::text FROM loyalty_accounts WHERE id = $1 FOR UPDATE`,
            [row.account_id],
          );
          const current = Number(accSel.rows[0]?.points_balance ?? 0);
          const target = Math.max(0, current - net); // retire les points gagnés, rend ceux dépensés
          const delta = target - current;
          if (delta === 0) continue;
          await client.query(
            `INSERT INTO loyalty_movements
               (organization_id, account_id, movement_type, points_delta, balance_after,
                reason, source_type, source_id, user_id)
             VALUES ($1,$2,'cancel',$3,$4,$5,'sale',$6,$7)`,
            [args.organizationId, row.account_id, delta, target,
             `Annulation ticket ${sale.receipt_number}`, sale.id, args.userId],
          );
          await client.query(
            `UPDATE loyalty_accounts SET points_balance = $1, updated_at = now() WHERE id = $2`,
            [target, row.account_id],
          );
        }
      }

      // 9. Marque la vente comme annulée (seule transition tolérée par le trigger)
      await client.query(
        `UPDATE sales SET status = 'cancelled_by_credit_note', updated_at = now() WHERE id = $1`,
        [sale.id],
      );

      return { credit_note_id: creditNoteId, number, amount, fiscal_hash: event.currentHash };
    });
  }
}
