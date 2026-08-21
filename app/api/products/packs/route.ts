import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { MAX_PACK_ITEMS, computePackPrice } from '@/lib/products/pack';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const packSchema = z.object({
  name: z.string().min(1).max(200),
  category_id: z.string().uuid().nullable().optional(),
  tax_rate_id: z.string().uuid(),
  visible_in_pos: z.boolean().default(true),
  is_active: z.boolean().default(true),
  discount_ttc: z.number().min(0).default(0),
  store_ids: z.array(z.string().uuid()).optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().positive().max(999).default(1),
  })).min(1).max(MAX_PACK_ITEMS),
});

export async function productColumnExists(col: string): Promise<boolean> {
  const r = await query<{ e: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = $1) AS e`,
    [col],
  );
  return r.rows[0]?.e ?? false;
}

/** Charge prix + validité des composants (même org, non-pack). */
export async function loadPackComponents(
  organizationId: string,
  items: { product_id: string; quantity: number }[],
) {
  const ids = items.map((i) => i.product_id);
  const r = await query<{ id: string; sale_price_ttc: string; is_pack: boolean }>(
    `SELECT id, sale_price_ttc, COALESCE(is_pack, FALSE) AS is_pack
       FROM products WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [organizationId, ids],
  );
  const byId = new Map(r.rows.map((x) => [x.id, x]));
  return items.map((it) => {
    const p = byId.get(it.product_id);
    return {
      product_id: it.product_id,
      quantity: it.quantity,
      price: p ? Number(p.sale_price_ttc) : NaN,
      is_pack: p ? p.is_pack : true,
      found: !!p,
    };
  });
}

export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, packSchema);
  if ('response' in parsed) return parsed.response;
  const p = parsed.data;

  const tax = await query(
    `SELECT 1 FROM tax_rates WHERE id = $1 AND organization_id = $2`,
    [p.tax_rate_id, g.user.organizationId],
  );
  if (tax.rowCount === 0) return jsonError('TAX_RATE_NOT_FOUND', 404);

  const comps = await loadPackComponents(g.user.organizationId, p.items);
  if (comps.some((c) => !c.found)) return jsonError('COMPONENT_NOT_FOUND', 404);
  if (comps.some((c) => c.is_pack)) return jsonError('PACK_IN_PACK', 400);

  const price = computePackPrice(comps.map((c) => ({ price: c.price, quantity: c.quantity })), p.discount_ttc);
  const hasStoreIds = await productColumnExists('store_ids');

  const id = await withTransaction(async (client) => {
    const cols = ['organization_id', 'name', 'category_id', 'tax_rate_id', 'sale_price_ttc',
      'track_stock', 'is_pack', 'pack_discount_ttc', 'visible_in_pos', 'is_active'];
    const vals: unknown[] = [
      g.user.organizationId, p.name, p.category_id ?? null, p.tax_rate_id, price,
      false, true, p.discount_ttc, p.visible_in_pos, p.is_active,
    ];
    if (hasStoreIds) {
      let storeIds: string[];
      if (p.store_ids !== undefined) storeIds = p.store_ids;
      else if (['super_admin', 'owner'].includes(g.user.role)) storeIds = [];
      else {
        const acc = await client.query<{ store_id: string }>(
          `SELECT store_id FROM user_store_access WHERE user_id = $1`, [g.user.id],
        );
        storeIds = acc.rows.map((r) => r.store_id);
      }
      cols.push('store_ids'); vals.push(storeIds);
    }
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    const ins = await client.query<{ id: string }>(
      `INSERT INTO products (${cols.join(',')}) VALUES (${ph}) RETURNING id`, vals,
    );
    const packId = ins.rows[0]!.id;
    for (let i = 0; i < p.items.length; i++) {
      const it = p.items[i]!;
      await client.query(
        `INSERT INTO product_pack_items (organization_id, pack_id, component_id, quantity, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [g.user.organizationId, packId, it.product_id, it.quantity, i],
      );
    }
    return packId;
  });

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.pack.create', entityType: 'product', entityId: id,
    payload: { name: p.name, price },
  });
  return NextResponse.json({ id, sale_price_ttc: price });
}
