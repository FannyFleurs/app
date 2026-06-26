import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  short_description: z.string().max(500).nullable().optional(),
  long_description: z.string().max(5000).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  sku: z.string().max(80).nullable().optional(),
  barcode: z.string().max(80).nullable().optional(),
  image_url: z.string().max(500).nullable().optional(),
  unit: z.string().max(20).optional(),
  tax_rate_id: z.string().uuid().optional(),
  sale_price_ttc: z.number().min(0).optional(),
  price_change_reason: z.string().max(200).optional(),
  price_is_free: z.boolean().optional(),
  track_stock: z.boolean().optional(),
  is_seasonal: z.boolean().optional(),
  is_top_product: z.boolean().optional(),
  is_customizable: z.boolean().optional(),
  visible_in_pos: z.boolean().optional(),
  is_active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const patch = parsed.data;

  await withTransaction(async (client) => {
    const cur = await client.query<{
      id: string; sale_price_ttc: string;
    }>(
      `SELECT id, sale_price_ttc FROM products
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [params.id, g.user.organizationId],
    );
    if (cur.rowCount === 0) {
      throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    }

    if (
      patch.sale_price_ttc != null &&
      Number(cur.rows[0]!.sale_price_ttc) !== patch.sale_price_ttc
    ) {
      await client.query(
        `INSERT INTO product_price_history
          (organization_id, product_id, old_price_ttc, new_price_ttc, reason, user_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          g.user.organizationId,
          params.id,
          Number(cur.rows[0]!.sale_price_ttc),
          patch.sale_price_ttc,
          patch.price_change_reason ?? null,
          g.user.id,
        ],
      );
    }

    const setParts: string[] = ['updated_by = $1', 'updated_at = now()'];
    const values: unknown[] = [g.user.id];
    let i = 2;
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'price_change_reason') continue;
      setParts.push(`${k} = $${i++}`);
      values.push(v);
    }
    values.push(params.id, g.user.organizationId);
    await client.query(
      `UPDATE products SET ${setParts.join(', ')}
        WHERE id = $${i++} AND organization_id = $${i}`,
      values,
    );
  });

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.update', entityType: 'product', entityId: params.id,
    payload: patch,
  });

  return NextResponse.json({ ok: true });
}
