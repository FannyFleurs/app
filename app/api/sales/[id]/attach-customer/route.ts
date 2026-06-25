import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  customer_id: z.string().uuid(),
});

/**
 * Attache un client à une vente déjà validée (cas : oubli en caisse).
 * Le trigger fn_protect_validated_sale autorise la mise à jour de
 * customer_id : seuls les champs fiscaux sont gelés.
 *
 * Si le programme fidélité est activé et que la vente n'a pas encore
 * généré de gain pour ce client, on crédite automatiquement le compte.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { customer_id } = parsed.data;

  try {
    const out = await withTransaction(async (client) => {
      const saleRes = await client.query<{
        id: string; status: string; store_id: string; register_id: string;
        receipt_number: string; customer_id: string | null; total_ttc: string;
      }>(
        `SELECT id, status, store_id, register_id, receipt_number, customer_id, total_ttc
           FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [params.id, g.user.organizationId],
      );
      if (saleRes.rowCount === 0) throw new Error('SALE_NOT_FOUND');
      const sale = saleRes.rows[0]!;
      if (sale.status !== 'validated') throw new Error('SALE_NOT_VALIDATED');
      if (sale.customer_id) throw new Error('CUSTOMER_ALREADY_ATTACHED');

      const cust = await client.query(
        `SELECT 1 FROM customers WHERE id = $1 AND organization_id = $2`,
        [customer_id, g.user.organizationId],
      );
      if (cust.rowCount === 0) throw new Error('CUSTOMER_NOT_FOUND');

      // Maj de la vente (autorisé : ne touche pas aux champs gelés)
      await client.query(
        `UPDATE sales SET customer_id = $1, updated_at = now() WHERE id = $2`,
        [customer_id, sale.id],
      );

      // Fidélité : auto-earn si activée
      let loyaltyResult: { earned: number; new_balance: number } | null = null;
      const cfgRes = await client.query<{ value: { loyalty?: { enabled?: boolean; euros_earned?: number; per_euros_spent?: number } } }>(
        `SELECT value FROM settings WHERE organization_id = $1 AND key = 'pos_ui'`,
        [g.user.organizationId],
      );
      const loyaltyCfg = cfgRes.rows[0]?.value?.loyalty;
      const enabled = loyaltyCfg?.enabled === true;
      const earnedPer = Number(loyaltyCfg?.euros_earned ?? 0);
      const perSpent = Number(loyaltyCfg?.per_euros_spent ?? 0);

      if (enabled && earnedPer > 0 && perSpent > 0) {
        // Compte fidélité (créé si besoin)
        let accId: string;
        let balance = 0;
        const accSel = await client.query<{ id: string; points_balance: number }>(
          `SELECT id, points_balance FROM loyalty_accounts
            WHERE customer_id = $1 FOR UPDATE`,
          [customer_id],
        );
        if (accSel.rowCount === 0) {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance)
             VALUES ($1,$2,0) RETURNING id`,
            [g.user.organizationId, customer_id],
          );
          accId = ins.rows[0]!.id;
        } else {
          accId = accSel.rows[0]!.id;
          balance = Number(accSel.rows[0]!.points_balance);
        }

        // Évite le double crédit pour la même vente
        const already = await client.query(
          `SELECT 1 FROM loyalty_movements
            WHERE account_id = $1 AND source_type = 'sale' AND source_id = $2 AND movement_type = 'earn'`,
          [accId, sale.id],
        );

        if (already.rowCount === 0) {
          const totalTtc = Number(sale.total_ttc);
          const earnedInt = Math.floor((totalTtc / perSpent) * earnedPer);
          if (earnedInt > 0) {
            const newBalance = balance + earnedInt;
            await client.query(
              `INSERT INTO loyalty_movements
                 (organization_id, account_id, movement_type, points_delta,
                  balance_after, reason, source_type, source_id, user_id)
               VALUES ($1,$2,'earn',$3,$4,$5,'sale',$6,$7)`,
              [
                g.user.organizationId, accId, earnedInt, newBalance,
                `Attribution post-vente ticket ${sale.receipt_number}`,
                sale.id, g.user.id,
              ],
            );
            await client.query(
              `UPDATE loyalty_accounts SET points_balance = $1, updated_at = now()
                WHERE id = $2`,
              [newBalance, accId],
            );
            loyaltyResult = { earned: earnedInt, new_balance: newBalance };
          }
        }
      }

      // Événement fiscal traçant l'attribution
      const fiscal = new FiscalCore(client);
      await fiscal.recordEvent({
        organizationId: g.user.organizationId,
        storeId: sale.store_id,
        registerId: sale.register_id,
        userId: g.user.id,
        eventType: 'PAYMENT_REGISTERED', // type générique réutilisé
        entityType: 'sale',
        entityId: sale.id,
        payload: {
          customer_attached: true,
          sale_id: sale.id,
          receipt_number: sale.receipt_number,
          customer_id,
          loyalty: loyaltyResult,
        },
        amountTtcDelta: 0,
      });

      return { customer_id, loyalty: loyaltyResult };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'sales.attach_customer_after',
      entityType: 'sale', entityId: params.id,
      payload: { customer_id },
    });

    return NextResponse.json(out);
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'SALE_NOT_FOUND' || msg === 'CUSTOMER_NOT_FOUND' ? 404 :
      msg === 'SALE_NOT_VALIDATED' || msg === 'CUSTOMER_ALREADY_ATTACHED' ? 409 : 400;
    return jsonError(msg, status);
  }
}
