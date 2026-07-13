import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const productSchema = z.object({
  name: z.string().min(1).max(200),
  short_description: z.string().max(500).optional().nullable(),
  long_description: z.string().max(5000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  sku: z.string().max(80).optional().nullable(),
  barcode: z.string().max(80).optional().nullable(),
  supplier_ref: z.string().max(80).optional().nullable(),
  image_url: z.string().max(500).optional().nullable(),
  unit: z.string().max(20).default('unité'),
  tax_rate_id: z.string().uuid(),
  purchase_price_ht: z.number().min(0).optional().nullable(),
  sale_price_ttc: z.number().min(0),
  price_is_free: z.boolean().default(false),
  track_stock: z.boolean().default(false),
  min_stock: z.number().min(0).optional().nullable(),
  max_stock: z.number().min(0).optional().nullable(),
  is_seasonal: z.boolean().default(false),
  is_customizable: z.boolean().default(false),
  visible_in_pos: z.boolean().default(true),
  is_active: z.boolean().default(true),
  is_top_product: z.boolean().default(false),
  no_discount: z.boolean().default(false),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  tags: z.array(z.string()).default([]),
  /**
   * Portee du produit par boutique. Array vide = visible dans TOUTES
   * les boutiques de l'org (retrocompat). Sinon, uniquement dans les
   * boutiques listees.
   */
  store_ids: z.array(z.string().uuid()).default([]),
});

/**
 * Cache d'introspection : indique si la colonne products.store_ids
 * existe (migration 0025 appliquee).
 */
let _hasStoreIds: boolean | null = null;
async function hasStoreIdsColumn(): Promise<boolean> {
  if (_hasStoreIds !== null) return _hasStoreIds;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'store_ids'
     ) AS exists`,
  );
  _hasStoreIds = !!r.rows[0]?.exists;
  return _hasStoreIds;
}

// Cache d'introspection : colonne products.supplier_id (migration 0038).
let _hasSupplier: boolean | null = null;
async function hasSupplierColumn(): Promise<boolean> {
  if (_hasSupplier !== null) return _hasSupplier;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'supplier_id'
     ) AS exists`,
  );
  _hasSupplier = !!r.rows[0]?.exists;
  return _hasSupplier;
}

// Cache d'introspection : indique si la colonne products.is_top_product
// existe (migration 0008 appliquée). Évite de planter si la migration n'a
// pas encore tourné sur la base.
let _hasTopColumn: boolean | null = null;
async function hasTopColumn(): Promise<boolean> {
  if (_hasTopColumn !== null) return _hasTopColumn;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'is_top_product'
     ) AS exists`,
  );
  _hasTopColumn = !!r.rows[0]?.exists;
  return _hasTopColumn;
}

export async function GET(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const onlyActive = url.searchParams.get('active') !== 'false';
  const inPos = url.searchParams.get('pos') === '1';
  const storeId = url.searchParams.get('store_id') || undefined;

  const params: unknown[] = [g.user.organizationId];
  let where = `p.organization_id = $1`;
  if (onlyActive) where += ` AND p.is_active = TRUE`;
  if (inPos) where += ` AND p.visible_in_pos = TRUE`;
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    params.push(q);
    where += ` AND (lower(p.name) LIKE $${params.length - 1} OR p.barcode = $${params.length} OR p.sku = $${params.length})`;
  }
  // Filtre par boutique : produit visible si son store_ids est vide
  // (portee "toutes") OU contient le store demande.
  if (storeId && (await hasStoreIdsColumn())) {
    params.push(storeId);
    where += ` AND (COALESCE(array_length(p.store_ids, 1), 0) = 0 OR p.store_ids @> ARRAY[$${params.length}]::uuid[])`;
  }

  const topCol = (await hasTopColumn())
    ? `COALESCE(p.is_top_product, FALSE) AS is_top_product`
    : `FALSE AS is_top_product`;

  // Détection optionnelle de la colonne no_discount (migration 0012).
  const ndRes = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'no_discount'
     ) AS exists`,
  );
  const ndCol = ndRes.rows[0]?.exists
    ? `COALESCE(p.no_discount, FALSE) AS no_discount`
    : `FALSE AS no_discount`;

  // Détection optionnelle de la colonne color (migration 0018).
  const colorRes = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'color'
     ) AS exists`,
  );
  const colorCol = colorRes.rows[0]?.exists ? `p.color` : `NULL AS color`;
  const storeIdsCol = (await hasStoreIdsColumn())
    ? `p.store_ids`
    : `'{}'::uuid[] AS store_ids`;
  const hasSupplier = await hasSupplierColumn();
  const supplierCols = hasSupplier
    ? `p.supplier_id, sup.name AS supplier_name`
    : `NULL AS supplier_id, NULL AS supplier_name`;
  const supplierJoin = hasSupplier ? `LEFT JOIN suppliers sup ON sup.id = p.supplier_id` : '';

  const { rows } = await query(
    `SELECT p.id, p.name, p.short_description, p.sku, p.barcode, p.image_url, p.unit,
            p.sale_price_ttc, p.purchase_price_ht, p.price_is_free,
            p.category_id, p.visible_in_pos, p.is_active,
            ${topCol},
            ${ndCol},
            ${colorCol},
            ${storeIdsCol},
            ${supplierCols},
            p.tags, p.is_seasonal, p.is_customizable,
            t.rate AS tax_rate, t.id AS tax_rate_id, t.code AS tax_rate_code, t.label AS tax_rate_label,
            c.name AS category_name, c.color AS category_color
       FROM products p
       JOIN tax_rates t ON t.id = p.tax_rate_id
       LEFT JOIN product_categories c ON c.id = p.category_id
       ${supplierJoin}
      WHERE ${where}
      ORDER BY p.name ASC
      LIMIT 500`,
    params,
  );
  return NextResponse.json({ products: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, productSchema);
  if ('response' in parsed) return parsed.response;
  const p = parsed.data;

  // Sanity : taux TVA appartient bien à l'org
  const tax = await query(
    `SELECT 1 FROM tax_rates WHERE id = $1 AND organization_id = $2`,
    [p.tax_rate_id, g.user.organizationId],
  );
  if (tax.rowCount === 0) return jsonError('TAX_RATE_NOT_FOUND', 404);

  const withTop = await hasTopColumn();

  try {
    const cols = [
      'organization_id', 'name', 'short_description', 'long_description', 'category_id',
      'sku', 'barcode', 'supplier_ref', 'image_url', 'unit', 'tax_rate_id', 'purchase_price_ht',
      'sale_price_ttc', 'price_is_free', 'track_stock', 'min_stock', 'max_stock',
      'is_seasonal', 'is_customizable', 'visible_in_pos', 'is_active', 'tags',
    ];
    const values: unknown[] = [
      g.user.organizationId, p.name, p.short_description ?? null, p.long_description ?? null,
      p.category_id ?? null, p.sku ?? null, p.barcode ?? null, p.supplier_ref ?? null,
      p.image_url ?? null, p.unit, p.tax_rate_id, p.purchase_price_ht ?? null,
      p.sale_price_ttc, p.price_is_free, p.track_stock, p.min_stock ?? null, p.max_stock ?? null,
      p.is_seasonal, p.is_customizable, p.visible_in_pos, p.is_active, p.tags,
    ];
    if (withTop) {
      cols.push('is_top_product');
      values.push(p.is_top_product);
    }
    // Détection optionnelle de la colonne no_discount (migration 0012).
    const ndExists = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'no_discount'
       ) AS exists`,
    );
    if (ndExists.rows[0]?.exists) {
      cols.push('no_discount');
      values.push(p.no_discount);
    }
    // Détection optionnelle de la colonne color (migration 0018).
    const colorExists = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'color'
       ) AS exists`,
    );
    if (colorExists.rows[0]?.exists) {
      cols.push('color');
      values.push(p.color ?? null);
    }
    if (await hasStoreIdsColumn()) {
      cols.push('store_ids');
      values.push(p.store_ids);
    }
    if (await hasSupplierColumn()) {
      cols.push('supplier_id');
      values.push(p.supplier_id ?? null);
    }
    // created_by + updated_by partagent la même valeur
    cols.push('created_by', 'updated_by');
    const userIdx = values.length + 1; // index $N de g.user.id
    values.push(g.user.id);

    const placeholders = cols
      .map((c, i) => {
        if (c === 'created_by' || c === 'updated_by') return `$${userIdx}`;
        return `$${i + 1}`;
      })
      .join(',');

    const ins = await query<{ id: string }>(
      `INSERT INTO products (${cols.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values,
    );

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'products.create', entityType: 'product', entityId: ins.rows[0]!.id,
      payload: { name: p.name },
    });

    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[products.create]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (err as Error).message },
      { status: 500 },
    );
  }
}
