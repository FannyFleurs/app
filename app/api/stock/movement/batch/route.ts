import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const MOVEMENT_TYPES = ['purchase', 'adjustment', 'loss', 'transfer_in', 'transfer_out', 'inventory'] as const;

const schema = z.object({
  store_id: z.string().uuid(),
  movement_type: z.enum(MOVEMENT_TYPES).default('purchase'),
  reason: z.string().min(1).max(200),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional().nullable(),
    quantity_delta: z.number(),
  })).min(1).max(500),
});

/**
 * Entrée multiple : applique en UNE transaction plusieurs mouvements de stock
 * (scan en série sur le PDA, validés en une fois). Chaque article suit la même
 * logique NULL-safe que /api/stock/movement (verrou + upsert du niveau).
 */
export async function POST(req: Request) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const applied = await withTransaction(async (client) => {
      let count = 0;
      for (const it of d.items) {
        if (it.quantity_delta === 0) continue;
        const existing = await client.query<{ id: string; quantity: string }>(
          `SELECT id, quantity FROM stock_levels
            WHERE store_id = $1 AND product_id = $2
              AND variant_id IS NOT DISTINCT FROM $3
            FOR UPDATE`,
          [d.store_id, it.product_id, it.variant_id ?? null],
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
            [g.user.organizationId, d.store_id, it.product_id, it.variant_id ?? null],
          );
          levelId = ins.rows[0]!.id;
          prev = 0;
        }
        const next = Number((prev + it.quantity_delta).toFixed(3));
        await client.query(
          `UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE id = $2`,
          [next, levelId],
        );
        await client.query(
          `INSERT INTO stock_movements
             (organization_id, store_id, product_id, variant_id,
              movement_type, quantity_delta, previous_quantity, new_quantity,
              reason, user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            g.user.organizationId, d.store_id, it.product_id, it.variant_id ?? null,
            d.movement_type, it.quantity_delta, prev, next, d.reason, g.user.id,
          ],
        );
        count++;
      }
      return count;
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'stock.movement.batch', entityType: 'store', entityId: d.store_id,
      payload: { count: applied, movement_type: d.movement_type, reason: d.reason },
    });

    return NextResponse.json({ applied }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stock.movement.batch]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: (err as Error).message }, { status: 500 });
  }
}
