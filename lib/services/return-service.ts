import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';
import { round2 } from './money';

export interface ReturnLineInput {
  line_index: number;
  quantity: number; // qté retournée
}

/**
 * Service d'annulation par avoir.
 * Création d'un credit_note à partir d'une vente validée :
 *   - L'original reste immuable (trigger fn_protect_validated_sale)
 *   - Insère un credit_notes append-only avec un numéro de séquence dédié
 *   - Pose un événement fiscal CREDIT_NOTE_ISSUED avec amountTtcDelta négatif
 *     (réduit le cumul perpétuel TTC du grand total)
 *   - Recrédite le stock pour les produits suivis (mouvements type='return')
 *   - Si refund_method = 'cash' : insère un cash_movement 'out' + marque
 *     l'avoir comme déjà utilisé (used_amount = amount)
 *   - Si retour total : passe la vente d'origine en status='cancelled_by_credit_note'
 */
export class ReturnService {
  static async createCreditNote(args: {
    organizationId: string;
    userId: string;
    saleId: string;
    lines: ReturnLineInput[];
    reason: string;
    refundMethod: 'credit_note' | 'cash' | 'card' | 'transfer' | 'check' | 'on_account';
  }): Promise<{
    credit_note_id: string;
    number: string;
    fiscal_hash: string;
    amount: number;
    is_full_return: boolean;
  }> {
    if (!args.reason.trim()) throw new Error('REASON_REQUIRED');
    if (args.lines.length === 0) throw new Error('NO_LINES');

    return withTransaction(async (client) => {
      // 1. Verrouille la vente
      const saleRes = await client.query<{
        id: string; status: string; store_id: string; register_id: string;
        cash_session_id: string;
        receipt_number: string; customer_id: string | null;
        total_ttc: string;
      }>(
        `SELECT id, status, store_id, register_id, cash_session_id, receipt_number,
                customer_id, total_ttc
           FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [args.saleId, args.organizationId],
      );
      if (saleRes.rowCount === 0) throw new Error('SALE_NOT_FOUND');
      const sale = saleRes.rows[0]!;
      if (sale.status !== 'validated') throw new Error('SALE_NOT_REFUNDABLE');

      // 2. Récupère les lignes d'origine pour valider et calculer
      const linesRes = await client.query<{
        line_index: number; label: string;
        unit_price_ttc: string; quantity: string;
        discount_amount: string; tax_rate: string; tax_rate_code: string;
        line_ht: string; line_tva: string; line_ttc: string;
        product_id: string | null; variant_id: string | null;
      }>(
        `SELECT line_index, label, unit_price_ttc, quantity,
                discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc,
                product_id, variant_id
           FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`,
        [sale.id],
      );
      const byIndex = new Map(linesRes.rows.map((r) => [r.line_index, r]));

      // Avoirs précédents (pour empêcher de dépasser)
      const prevReturnsRes = await client.query<{ payload: { lines?: Array<{ line_index: number; quantity: number }> } }>(
        `SELECT payload FROM fiscal_events
          WHERE organization_id = $1 AND entity_type = 'credit_note'
            AND payload->>'origin_sale_id' = $2`,
        [args.organizationId, sale.id],
      );
      const alreadyReturned = new Map<number, number>();
      for (const ev of prevReturnsRes.rows) {
        for (const l of ev.payload?.lines ?? []) {
          alreadyReturned.set(l.line_index, (alreadyReturned.get(l.line_index) ?? 0) + Number(l.quantity));
        }
      }

      // 3. Validation + calcul du montant
      let refundAmount = 0;
      const detail: Array<{
        line_index: number; label: string;
        quantity: number; unit_price_ttc: number;
        tax_rate: number; refunded_ttc: number;
        product_id: string | null; variant_id: string | null;
      }> = [];

      for (const l of args.lines) {
        const orig = byIndex.get(l.line_index);
        if (!orig) throw new Error(`LINE_NOT_FOUND_${l.line_index}`);
        const origQty = Number(orig.quantity);
        const already = alreadyReturned.get(l.line_index) ?? 0;
        const remaining = origQty - already;
        if (l.quantity <= 0) continue;
        if (l.quantity > remaining + 0.0001) {
          throw new Error(`QUANTITY_EXCEEDS_LINE_${l.line_index}`);
        }
        const unitTtc = Number(orig.unit_price_ttc);
        const lineDiscount = Number(orig.discount_amount);
        const baseTtc = unitTtc * origQty - lineDiscount;
        const ratio = l.quantity / origQty;
        const refundedTtc = round2(baseTtc * ratio);

        refundAmount = round2(refundAmount + refundedTtc);
        detail.push({
          line_index: l.line_index,
          label: orig.label,
          quantity: l.quantity,
          unit_price_ttc: unitTtc,
          tax_rate: Number(orig.tax_rate),
          refunded_ttc: refundedTtc,
          product_id: orig.product_id,
          variant_id: orig.variant_id,
        });
      }

      if (refundAmount <= 0) throw new Error('NOTHING_TO_REFUND');
      refundAmount = round2(refundAmount);

      // Détermine si retour total
      const totalQty = linesRes.rows.reduce((s, r) => s + Number(r.quantity), 0);
      const totalReturnedNow = detail.reduce((s, d) => s + d.quantity, 0);
      const totalAlreadyReturned = Array.from(alreadyReturned.values()).reduce((s, v) => s + v, 0);
      const isFullReturn = round2(totalReturnedNow + totalAlreadyReturned) >= round2(totalQty);

      // 4. Numéro de séquence avoir
      const fiscal = new FiscalCore(client);
      const year = new Date().getUTCFullYear();
      const { value: seqValue, formatted: number } = await fiscal.nextDocumentNumber({
        organizationId: args.organizationId,
        kind: 'credit_note',
        year,
        prefix: 'A',
      });

      // 5. Insertion credit_note (placeholder hash en attendant l'event)
      // Pour credit_note (= avoir) : status='open' → utilisable plus tard
      // Pour tout autre mode (cash/card/transfer/check/on_account) :
      //   l'avoir est immédiatement consommé par le remboursement effectif,
      //   donc status='used' et used_amount = refundAmount.
      const immediateRefund = args.refundMethod !== 'credit_note';
      const usedAmount = immediateRefund ? refundAmount : 0;
      const status = immediateRefund ? 'used' : 'open';

      // Détection runtime des colonnes ajoutées par migration 0014
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
              number, sequence_value, amount, reason,
              status, used_amount, fiscal_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
           RETURNING id`,
          [
            args.organizationId, sale.id, sale.customer_id, args.refundMethod,
            number, seqValue.toString(),
            refundAmount, args.reason.trim(),
            status, usedAmount,
          ],
        );
      } else {
        cnIns = await client.query<{ id: string }>(
          `INSERT INTO credit_notes
             (organization_id, sale_id, number, sequence_value, amount, reason,
              status, used_amount, fiscal_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
           RETURNING id`,
          [
            args.organizationId, sale.id, number, seqValue.toString(),
            refundAmount, args.reason.trim(),
            status, usedAmount,
          ],
        );
      }
      const creditNoteId = cnIns.rows[0]!.id;

      // 6. Fiscal event (réduit grand_total_ttc)
      const eventPayload = {
        credit_note_id: creditNoteId,
        credit_note_number: number,
        origin_sale_id: sale.id,
        origin_receipt_number: sale.receipt_number,
        amount: refundAmount,
        refund_method: args.refundMethod,
        is_full_return: isFullReturn,
        reason: args.reason.trim(),
        lines: detail.map((d) => ({
          line_index: d.line_index, quantity: d.quantity,
          refunded_ttc: d.refunded_ttc, label: d.label,
          tax_rate: d.tax_rate,
        })),
      };
      const event = await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: sale.store_id,
        registerId: sale.register_id,
        userId: args.userId,
        eventType: 'CREDIT_NOTE_ISSUED',
        entityType: 'credit_note',
        entityId: creditNoteId,
        payload: eventPayload,
        amountTtcDelta: -refundAmount,
      });

      // 7. Pose le hash sur l'avoir
      await client.query(
        `UPDATE credit_notes SET fiscal_hash = $1 WHERE id = $2`,
        [event.currentHash, creditNoteId],
      );

      // 8. Recrédit stock pour produits suivis
      for (const d of detail) {
        if (!d.product_id) continue;
        const trackRes = await client.query<{ track_stock: boolean }>(
          `SELECT track_stock FROM products WHERE id = $1`,
          [d.product_id],
        );
        if (!trackRes.rows[0]?.track_stock) continue;
        // Voir sale-service : ON CONFLICT ne matche pas les variant_id NULL,
        // d'où lecture verrouillée NULL-safe puis update/insert.
        const existing = await client.query<{ id: string; quantity: string }>(
          `SELECT id, quantity FROM stock_levels
            WHERE store_id = $1 AND product_id = $2
              AND variant_id IS NOT DISTINCT FROM $3
            FOR UPDATE`,
          [sale.store_id, d.product_id, d.variant_id],
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
            [args.organizationId, sale.store_id, d.product_id, d.variant_id],
          );
          levelId = ins.rows[0]!.id;
          prev = 0;
        }
        const next = prev + d.quantity;
        await client.query(
          `UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE id = $2`,
          [next, levelId],
        );
        await client.query(
          `INSERT INTO stock_movements
             (organization_id, store_id, product_id, variant_id,
              movement_type, quantity_delta, previous_quantity, new_quantity,
              reason, source_type, source_id, user_id)
           VALUES ($1,$2,$3,$4,'return',$5,$6,$7,$8,'credit_note',$9,$10)`,
          [
            args.organizationId, sale.store_id, d.product_id, d.variant_id,
            d.quantity, prev, next,
            `Retour avoir ${number}`,
            creditNoteId, args.userId,
          ],
        );
      }

      // 9. Effet selon le mode de remboursement
      if (args.refundMethod === 'cash' && sale.cash_session_id) {
        // Sortie immédiate du tiroir-caisse
        await client.query(
          `INSERT INTO cash_movements
             (organization_id, cash_session_id, movement_type, amount, reason, user_id)
           VALUES ($1,$2,'out',$3,$4,$5)`,
          [
            args.organizationId, sale.cash_session_id, refundAmount,
            `Remboursement espèces avoir ${number}`,
            args.userId,
          ],
        );
      } else if (args.refundMethod === 'on_account' && sale.customer_id) {
        // Crédite le solde "en compte" du client (positif = avoir un crédit)
        try {
          await client.query(
            `UPDATE customers
                SET account_balance = COALESCE(account_balance, 0) + $2,
                    updated_at = now()
              WHERE id = $1`,
            [sale.customer_id, refundAmount],
          );
        } catch {
          // Migration 0012 pas appliquée : on tracera l'audit, c'est tout.
        }
      }
      // Pour 'card', 'transfer', 'check' : aucune écriture automatique
      // (l'opération physique a lieu hors caisse). L'avoir est marqué
      // "used" pour qu'il n'apparaisse plus comme disponible.

      // 10. Si retour total, marque la vente comme annulée par avoir
      if (isFullReturn) {
        await client.query(
          `UPDATE sales SET status = 'cancelled_by_credit_note', updated_at = now()
            WHERE id = $1`,
          [sale.id],
        );
      }

      return {
        credit_note_id: creditNoteId,
        number,
        fiscal_hash: event.currentHash,
        amount: refundAmount,
        is_full_return: isFullReturn,
      };
    });
  }
}
