import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction, query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const MOVEMENT_TYPES = ['purchase','adjustment','loss','transfer_in','transfer_out','inventory'] as const;

const schema = z.object({
  store_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  movement_type: z.enum(MOVEMENT_TYPES),
  quantity_delta: z.number(),
  reason: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const out = await withTransaction(async (client) => {
      const lvl = await client.query<{ id: string; quantity: string }>(
        `INSERT INTO stock_levels (organization_id, store_id, product_id, variant_id, quantity)
         VALUES ($1,$2,$3,$4,0)
         ON CONFLICT (store_id, product_id, variant_id) DO UPDATE SET store_id = EXCLUDED.store_id
         RETURNING id, quantity`,
        [g.user.organizationId, d.store_id, d.product_id, d.variant_id ?? null],
      );
      const prev = Number(lvl.rows[0]!.quantity);
      const next = Number((prev + d.quantity_delta).toFixed(3));
      await client.query(
        `UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE id = $2`,
        [next, lvl.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO stock_movements
           (organization_id, store_id, product_id, variant_id,
            movement_type, quantity_delta, previous_quantity, new_quantity,
            reason, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          g.user.organizationId, d.store_id, d.product_id, d.variant_id ?? null,
          d.movement_type, d.quantity_delta, prev, next, d.reason, g.user.id,
        ],
      );
      return { previous_quantity: prev, new_quantity: next };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'stock.movement', entityType: 'product', entityId: d.product_id,
      payload: d,
    });

    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stock.movement]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const productId = url.searchParams.get('product_id');
  const params: unknown[] = [g.user.organizationId];
  let where = `m.organization_id = $1`;
  if (productId) { params.push(productId); where += ` AND m.product_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT m.id, m.movement_type, m.quantity_delta::text,
            m.previous_quantity::text, m.new_quantity::text,
            m.reason, m.created_at,
            p.name AS product_name, st.name AS store_name,
            u.full_name AS user_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       JOIN stores st ON st.id = m.store_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE ${where}
      ORDER BY m.created_at DESC LIMIT 200`,
    params,
  );
  return NextResponse.json({ movements: rows });
}
