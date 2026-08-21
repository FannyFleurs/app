import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { computePackPrice } from '@/lib/products/pack';
import { packSchema, productColumnExists, loadPackComponents, defaultTaxRateId } from '@/lib/products/pack-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, packSchema);
  if ('response' in parsed) return parsed.response;
  const p = parsed.data;

  // Un pack n'a pas de TVA propre (il éclate en composants à la vente). On
  // renseigne quand même products.tax_rate_id (colonne obligatoire) avec le
  // taux par défaut de l'organisation.
  const taxRateId = await defaultTaxRateId(g.user.organizationId);
  if (!taxRateId) return jsonError('TAX_RATE_NOT_FOUND', 404);

  const comps = await loadPackComponents(g.user.organizationId, p.items);
  if (comps.some((c) => !c.found)) return jsonError('COMPONENT_NOT_FOUND', 404);
  if (comps.some((c) => c.is_pack)) return jsonError('PACK_IN_PACK', 400);

  const price = computePackPrice(comps.map((c) => ({ price: c.price, quantity: c.quantity })), p.discount_ttc);
  const hasStoreIds = await productColumnExists('store_ids');

  const id = await withTransaction(async (client) => {
    const cols = ['organization_id', 'name', 'category_id', 'tax_rate_id', 'sale_price_ttc',
      'track_stock', 'is_pack', 'pack_discount_ttc', 'visible_in_pos', 'is_active'];
    const vals: unknown[] = [
      g.user.organizationId, p.name, p.category_id ?? null, taxRateId, price,
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
