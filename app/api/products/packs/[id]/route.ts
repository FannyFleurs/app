import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { computePackPrice } from '@/lib/products/pack';
import { packSchema, productColumnExists, loadPackComponents } from '@/lib/products/pack-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Détail d'un pack : le produit + sa composition (pour l'édition et la caisse). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;

  const prod = await query<{
    id: string; name: string; category_id: string | null; tax_rate_id: string;
    sale_price_ttc: string; pack_discount_ttc: string; visible_in_pos: boolean; is_active: boolean;
  }>(
    `SELECT id, name, category_id, tax_rate_id, sale_price_ttc,
            COALESCE(pack_discount_ttc, 0) AS pack_discount_ttc, visible_in_pos, is_active
       FROM products
      WHERE id = $1 AND organization_id = $2 AND COALESCE(is_pack, FALSE) = TRUE`,
    [params.id, g.user.organizationId],
  );
  if (prod.rowCount === 0) return jsonError('PACK_NOT_FOUND', 404);

  const items = await query<{
    component_id: string; quantity: string; name: string; sale_price_ttc: string;
  }>(
    `SELECT ppi.component_id, ppi.quantity, c.name, c.sale_price_ttc
       FROM product_pack_items ppi
       JOIN products c ON c.id = ppi.component_id
      WHERE ppi.pack_id = $1
      ORDER BY ppi.position ASC`,
    [params.id],
  );

  return NextResponse.json({
    pack: {
      ...prod.rows[0]!,
      sale_price_ttc: Number(prod.rows[0]!.sale_price_ttc),
      pack_discount_ttc: Number(prod.rows[0]!.pack_discount_ttc),
      items: items.rows.map((i) => ({
        product_id: i.component_id,
        quantity: Number(i.quantity),
        name: i.name,
        sale_price_ttc: Number(i.sale_price_ttc),
      })),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;

  const exists = await query(
    `SELECT 1 FROM products WHERE id = $1 AND organization_id = $2 AND COALESCE(is_pack, FALSE) = TRUE`,
    [params.id, g.user.organizationId],
  );
  if (exists.rowCount === 0) return jsonError('PACK_NOT_FOUND', 404);

  const parsed = await parseJson(req, packSchema);
  if ('response' in parsed) return parsed.response;
  const p = parsed.data;

  const tax = await query(`SELECT 1 FROM tax_rates WHERE id = $1 AND organization_id = $2`, [p.tax_rate_id, g.user.organizationId]);
  if (tax.rowCount === 0) return jsonError('TAX_RATE_NOT_FOUND', 404);

  const comps = await loadPackComponents(g.user.organizationId, p.items);
  if (comps.some((c) => !c.found)) return jsonError('COMPONENT_NOT_FOUND', 404);
  if (comps.some((c) => c.is_pack || c.product_id === params.id)) return jsonError('PACK_IN_PACK', 400);

  const price = computePackPrice(comps.map((c) => ({ price: c.price, quantity: c.quantity })), p.discount_ttc);
  const hasStoreIds = await productColumnExists('store_ids');

  await withTransaction(async (client) => {
    const sets = [
      'name = $2', 'category_id = $3', 'tax_rate_id = $4', 'sale_price_ttc = $5',
      'pack_discount_ttc = $6', 'visible_in_pos = $7', 'is_active = $8', 'updated_at = now()',
    ];
    const vals: unknown[] = [
      params.id, p.name, p.category_id ?? null, p.tax_rate_id, price,
      p.discount_ttc, p.visible_in_pos, p.is_active,
    ];
    if (hasStoreIds && p.store_ids !== undefined) {
      sets.push(`store_ids = $${vals.length + 1}`);
      vals.push(p.store_ids);
    }
    await client.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $1`, vals);

    await client.query(`DELETE FROM product_pack_items WHERE pack_id = $1`, [params.id]);
    for (let i = 0; i < p.items.length; i++) {
      const it = p.items[i]!;
      await client.query(
        `INSERT INTO product_pack_items (organization_id, pack_id, component_id, quantity, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [g.user.organizationId, params.id, it.product_id, it.quantity, i],
      );
    }
  });

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.pack.update', entityType: 'product', entityId: params.id,
    payload: { name: p.name, price },
  });
  return NextResponse.json({ id: params.id, sale_price_ttc: price });
}
