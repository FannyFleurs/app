import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const KINDS = ['cash','card','check','transfer','gift_card','credit_note','deferred','other'] as const;

const schema = z.object({
  from_method: z.enum(KINDS),
  to_method: z.enum(KINDS),
  amount: z.number().positive(),
  reason: z.string().max(200).optional(),
});

/**
 * Correction du mode de règlement d'une vente validée.
 *
 * La table `payments` est append-only (trigger). On ne modifie donc pas
 * la ligne d'origine : on inscrit :
 *   - un paiement -amount sur l'ancienne méthode (contre-passation)
 *   - un paiement +amount sur la nouvelle méthode
 * Le total des paiements reste égal au total TTC de la vente.
 *
 * Un événement fiscal PAYMENT_METHOD_CORRECTED est inscrit dans la chaîne
 * pour traçabilité (delta perpétuel = 0, car la somme n'a pas changé).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.refund');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { from_method, to_method, amount, reason } = parsed.data;

  if (from_method === to_method) return jsonError('SAME_METHOD', 422);

  try {
    const out = await withTransaction(async (client) => {
      const saleRes = await client.query<{
        id: string; status: string; store_id: string; register_id: string;
        receipt_number: string;
      }>(
        `SELECT id, status, store_id, register_id, receipt_number
           FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [params.id, g.user.organizationId],
      );
      if (saleRes.rowCount === 0) throw new Error('SALE_NOT_FOUND');
      const sale = saleRes.rows[0]!;
      if (sale.status !== 'validated') throw new Error('SALE_NOT_VALIDATED');

      // Vérifie qu'on a bien encaissé au moins ce montant sur la méthode source.
      const sumRes = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total
           FROM payments WHERE sale_id = $1 AND method = $2`,
        [sale.id, from_method],
      );
      const currentTotal = Number(sumRes.rows[0]!.total);
      if (currentTotal < amount - 0.005) throw new Error('AMOUNT_EXCEEDS_METHOD');

      // Contre-passation + nouvelle ligne
      await client.query(
        `INSERT INTO payments
           (organization_id, sale_id, method, amount, reference, user_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [g.user.organizationId, sale.id, from_method, -amount, 'CORRECTION', g.user.id],
      );
      await client.query(
        `INSERT INTO payments
           (organization_id, sale_id, method, amount, reference, user_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [g.user.organizationId, sale.id, to_method, amount, 'CORRECTION', g.user.id],
      );

      const fiscal = new FiscalCore(client);
      const event = await fiscal.recordEvent({
        organizationId: g.user.organizationId,
        storeId: sale.store_id,
        registerId: sale.register_id,
        userId: g.user.id,
        eventType: 'PAYMENT_REGISTERED',
        entityType: 'payment',
        entityId: sale.id,
        payload: {
          correction: true,
          sale_id: sale.id,
          receipt_number: sale.receipt_number,
          from_method, to_method, amount,
          reason: reason ?? null,
        },
        amountTtcDelta: 0,
      });

      return { fiscal_hash: event.currentHash, receipt_number: sale.receipt_number };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'sales.correct_payment',
      entityType: 'sale', entityId: params.id,
      payload: { from_method, to_method, amount, reason },
    });

    return NextResponse.json(out);
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'SALE_NOT_FOUND' ? 404 :
      msg === 'SALE_NOT_VALIDATED' ? 409 :
      msg === 'AMOUNT_EXCEEDS_METHOD' ? 422 :
      msg === 'SAME_METHOD' ? 422 : 400;
    return jsonError(msg, status);
  }
}
