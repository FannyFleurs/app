import { NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Validation finale : pour chaque ligne avec delta != 0, on ecrit un
 * stock_movement (type 'inventory') qui ajuste la quantite dans
 * stock_levels a la valeur comptee. Puis on passe l'inventaire a
 * "finalized".
 *
 * Renvoie un rapport :
 *   { positive_count, negative_count, positive_value, negative_value,
 *     movements: [{ product_name, delta, value }, ...] }
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  try {
    const result = await withTransaction(async (client) => {
      // Verifie que l'inventaire est en revue ET recupere le store_id
      const inv = await client.query<{ store_id: string; status: string }>(
        `SELECT store_id, status FROM inventories
          WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [params.id, g.user.organizationId],
      );
      if (inv.rowCount === 0) throw new Error('NOT_FOUND');
      if (inv.rows[0]!.status !== 'in_review') {
        throw new Error('INVENTORY_NOT_IN_REVIEW');
      }
      const storeId = inv.rows[0]!.store_id;

      // Recupere toutes les lignes avec ecart.
      const lines = await client.query<{
        id: string; product_id: string;
        expected_qty: string; counted_qty: string;
        purchase_price_ht: string | null;
        product_name: string;
      }>(
        `SELECT il.id, il.product_id,
                il.expected_qty::text, il.counted_qty::text,
                il.purchase_price_ht::text,
                p.name AS product_name
           FROM inventory_lines il
           JOIN products p ON p.id = il.product_id
          WHERE il.inventory_id = $1
            AND il.counted_qty <> il.expected_qty`,
        [params.id],
      );

      let posCount = 0, negCount = 0;
      let posValue = 0, negValue = 0;
      const movements: Array<{
        product_name: string; delta: number; value: number;
      }> = [];

      for (const l of lines.rows) {
        const expected = Number(l.expected_qty);
        const counted = Number(l.counted_qty);
        const delta = Number((counted - expected).toFixed(3));
        const price = l.purchase_price_ht ? Number(l.purchase_price_ht) : 0;
        const value = Number((delta * price).toFixed(4));

        if (delta > 0) { posCount++; posValue = Number((posValue + value).toFixed(4)); }
        else { negCount++; negValue = Number((negValue + value).toFixed(4)); }

        // Ajuste stock_levels + ecrit le mouvement.
        const cur = await client.query<{ quantity: string }>(
          `SELECT quantity::text FROM stock_levels
            WHERE product_id = $1 AND store_id = $2 AND organization_id = $3
            FOR UPDATE`,
          [l.product_id, storeId, g.user.organizationId],
        );
        const previous = cur.rows[0] ? Number(cur.rows[0].quantity) : 0;
        const next = Number((previous + delta).toFixed(3));

        if (cur.rowCount === 0) {
          await client.query(
            `INSERT INTO stock_levels
               (organization_id, store_id, product_id, quantity)
             VALUES ($1, $2, $3, $4)`,
            [g.user.organizationId, storeId, l.product_id, next],
          );
        } else {
          await client.query(
            `UPDATE stock_levels
                SET quantity = $1, updated_at = now()
              WHERE product_id = $2 AND store_id = $3 AND organization_id = $4`,
            [next, l.product_id, storeId, g.user.organizationId],
          );
        }

        await client.query(
          `INSERT INTO stock_movements
             (organization_id, store_id, product_id, movement_type,
              quantity_delta, previous_quantity, new_quantity,
              reason, source_type, source_id, user_id)
           VALUES ($1, $2, $3, 'inventory', $4, $5, $6, $7, 'inventory', $8, $9)`,
          [
            g.user.organizationId, storeId, l.product_id,
            delta, previous, next,
            `Inventaire : ${delta > 0 ? '+' : ''}${delta}`,
            params.id, g.user.id,
          ],
        );

        movements.push({
          product_name: l.product_name,
          delta,
          value,
        });
      }

      await client.query(
        `UPDATE inventories
            SET status = 'finalized',
                finalized_at = now(),
                finalized_by = $2,
                updated_at   = now()
          WHERE id = $1`,
        [params.id, g.user.id],
      );

      return {
        positive_count: posCount,
        negative_count: negCount,
        positive_value: posValue,
        negative_value: negValue,
        movements,
      };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'inventory.finalize', entityType: 'inventory', entityId: params.id,
      payload: {
        positive_count: result.positive_count,
        negative_count: result.negative_count,
        positive_value: result.positive_value,
        negative_value: result.negative_value,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'NOT_FOUND') return jsonError('NOT_FOUND', 404);
    if (msg === 'INVENTORY_NOT_IN_REVIEW') return jsonError('INVENTORY_NOT_IN_REVIEW', 409);
    // eslint-disable-next-line no-console
    console.error('[inventory.finalize]', err);
    return jsonError('INTERNAL_ERROR', 500, { message: msg });
  }
}
