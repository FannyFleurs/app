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
  discount_type: z.enum(['percent', 'amount']).optional().nullable(),
  discount_value: z.number().min(0).optional().nullable(),
  sku: z.string().max(80).optional().nullable(),
  barcode: z.string().max(80).optional().nullable(),
  // Codes-barres SUPPLÉMENTAIRES (multi-EAN). Le code principal reste `barcode`.
  extra_barcodes: z.array(z.string().max(80)).max(50).optional(),
  supplier_ref: z.string().max(80).optional().nullable(),
  image_url: z.string().max(500).optional().nullable(),
  unit: z.string().max(20).default('unité'),
  tax_rate_id: z.string().uuid(),
  purchase_price_ht: z.number().min(0).optional().nullable(),
  transport_cost_ht: z.number().min(0).optional().nullable(),
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
  store_ids: z.array(z.string().uuid()).optional(),
});

/**
 * Nettoie la liste des codes-barres supplémentaires : trim, retrait des vides,
 * dédoublonnage, et exclusion du code principal (pour ne pas le stocker deux
 * fois). Renvoie un tableau prêt pour la colonne text[].
 */
function normalizeExtraBarcodes(extra: string[] | undefined, mainBarcode: string | null): string[] {
  if (!Array.isArray(extra)) return [];
  const seen = new Set<string>();
  const main = mainBarcode?.trim();
  const out: string[] = [];
  for (const raw of extra) {
    const c = (raw ?? '').trim();
    if (!c || c === main || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

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

// Cache d'introspection : colonnes de remise article (migration 0039).
let _hasDiscount: boolean | null = null;
async function hasDiscountColumns(): Promise<boolean> {
  if (_hasDiscount !== null) return _hasDiscount;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'discount_type'
     ) AS exists`,
  );
  _hasDiscount = !!r.rows[0]?.exists;
  return _hasDiscount;
}

// Introspection générique mise en cache (module-level) pour éviter de
// requêter information_schema à chaque appel POS.
const _colCache = new Map<string, boolean>();
async function hasProductColumn(col: string): Promise<boolean> {
  const cached = _colCache.get(col);
  if (cached !== undefined) return cached;
  const r = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = $1
     ) AS exists`,
    [col],
  );
  const has = !!r.rows[0]?.exists;
  _colCache.set(col, has);
  return has;
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
  // Contexte : back-office (sous-domaine bo.) vs application (caisse).
  // Hors BO, chaque poste ne doit voir QUE les articles de sa boutique —
  // y compris dans la liste « Produits » (pas seulement les tuiles caisse).
  const backOffice = req.headers.get('x-webpos-bo') === '1';

  const params: unknown[] = [g.user.organizationId];
  let where = `p.organization_id = $1`;
  if (onlyActive) where += ` AND p.is_active = TRUE`;
  if (inPos) where += ` AND p.visible_in_pos = TRUE`;
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    params.push(q);
    const likeIdx = params.length - 1;
    const exactIdx = params.length;
    const extraMatch = (await hasProductColumn('extra_barcodes'))
      ? ` OR p.extra_barcodes @> ARRAY[$${exactIdx}]::text[]` : '';
    where += ` AND (lower(p.name) LIKE $${likeIdx} OR p.barcode = $${exactIdx} OR p.sku = $${exactIdx}${extraMatch})`;
  }
  // Filtre par boutique.
  //  - Back-office / listes : produit visible si store_ids est vide (portee
  //    "toutes boutiques") OU contient la boutique demandee.
  //  - Caisse (pos=1) : STRICTEMENT les articles rattaches a la boutique du
  //    poste. Un article sans rattachement (store_ids vide) n'apparait PAS sur
  //    une caisse dès que l'organisation compte plusieurs boutiques — chaque
  //    caisse ne montre que SES articles, quel que soit l'utilisateur connecte.
  //    Exception : organisation mono-boutique -> "vide" = l'unique boutique
  //    (retrocompat, evite une caisse vide).
  if (storeId && (await hasStoreIdsColumn())) {
    params.push(storeId);
    const storeParamIdx = params.length;
    // Filtre strict (uniquement les articles rattachés à cette boutique) dès
    // qu'on est sur l'application (hors BO) — caisse OU liste Produits — et que
    // l'organisation compte plusieurs boutiques.
    let strict = false;
    if (inPos || !backOffice) {
      const c = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM stores
          WHERE organization_id = $1 AND is_active = TRUE`,
        [g.user.organizationId],
      );
      strict = Number(c.rows[0]?.n ?? '1') > 1;
    }
    where += strict
      ? ` AND p.store_ids @> ARRAY[$${storeParamIdx}]::uuid[]`
      : ` AND (COALESCE(array_length(p.store_ids, 1), 0) = 0 OR p.store_ids @> ARRAY[$${storeParamIdx}]::uuid[])`;
  }

  // Verrouillage boutique cote serveur : un utilisateur rattache a des
  // boutiques precises (user_store_access) ne voit QUE les produits partages
  // (store_ids vide = toutes boutiques) ou attribues a l'une de SES boutiques.
  // Seuls super_admin et owner voient l'integralite du catalogue de l'org.
  if (!['super_admin', 'owner'].includes(g.user.role) && (await hasStoreIdsColumn())) {
    const access = await query<{ store_id: string }>(
      `SELECT store_id FROM user_store_access WHERE user_id = $1`,
      [g.user.id],
    );
    if (access.rows.length > 0) {
      params.push(access.rows.map((r) => r.store_id));
      where += ` AND (COALESCE(array_length(p.store_ids, 1), 0) = 0 OR p.store_ids && $${params.length}::uuid[])`;
    }
  }

  const topCol = (await hasTopColumn())
    ? `COALESCE(p.is_top_product, FALSE) AS is_top_product`
    : `FALSE AS is_top_product`;

  // Détection optionnelle des colonnes no_discount (0012) et color (0018),
  // mise en cache module-level (plus de requête information_schema par appel).
  const ndCol = (await hasProductColumn('no_discount'))
    ? `COALESCE(p.no_discount, FALSE) AS no_discount`
    : `FALSE AS no_discount`;
  const colorCol = (await hasProductColumn('color')) ? `p.color` : `NULL AS color`;
  const transportCol = (await hasProductColumn('transport_cost_ht'))
    ? `p.transport_cost_ht` : `NULL AS transport_cost_ht`;
  const storeIdsCol = (await hasStoreIdsColumn())
    ? `p.store_ids`
    : `'{}'::uuid[] AS store_ids`;
  const hasSupplier = await hasSupplierColumn();
  const supplierCols = hasSupplier
    ? `p.supplier_id, sup.name AS supplier_name`
    : `NULL AS supplier_id, NULL AS supplier_name`;
  const supplierJoin = hasSupplier ? `LEFT JOIN suppliers sup ON sup.id = p.supplier_id` : '';
  const discountCols = (await hasDiscountColumns())
    ? `p.discount_type, p.discount_value`
    : `NULL AS discount_type, NULL AS discount_value`;
  const extraBarcodesCol = (await hasProductColumn('extra_barcodes'))
    ? `p.extra_barcodes`
    : `'{}'::text[] AS extra_barcodes`;

  const { rows } = await query(
    `SELECT p.id, p.name, p.short_description, p.sku, p.barcode, ${extraBarcodesCol}, p.image_url, p.unit,
            p.sale_price_ttc, p.purchase_price_ht, p.price_is_free,
            p.category_id, p.visible_in_pos, p.is_active,
            ${topCol},
            ${ndCol},
            ${colorCol},
            ${transportCol},
            ${storeIdsCol},
            ${supplierCols},
            ${discountCols},
            p.tags, p.is_seasonal, p.is_customizable,
            t.rate AS tax_rate, t.id AS tax_rate_id, t.code AS tax_rate_code, t.label AS tax_rate_label,
            c.name AS category_name, c.color AS category_color
       FROM products p
       JOIN tax_rates t ON t.id = p.tax_rate_id
       LEFT JOIN product_categories c ON c.id = p.category_id
       ${supplierJoin}
      WHERE ${where}
      ORDER BY ${url.searchParams.get('order') === 'recent' ? 'p.created_at DESC' : 'p.name ASC'}
      LIMIT 20000`,
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
    if (await hasProductColumn('transport_cost_ht')) {
      cols.push('transport_cost_ht');
      values.push(p.transport_cost_ht ?? null);
    }
    if (await hasStoreIdsColumn()) {
      // store_ids fourni (back-office) : utilisé tel quel. Absent (app) : on
      // rattache automatiquement l'article à la/les boutique(s) de
      // l'utilisateur. Un owner/super_admin (ou un utilisateur sans
      // rattachement) crée un article partagé (store_ids vide = toutes).
      let storeIds: string[];
      if (p.store_ids !== undefined) {
        storeIds = p.store_ids;
      } else if (['super_admin', 'owner'].includes(g.user.role)) {
        storeIds = [];
      } else {
        const acc = await query<{ store_id: string }>(
          `SELECT store_id FROM user_store_access WHERE user_id = $1`,
          [g.user.id],
        );
        storeIds = acc.rows.map((r) => r.store_id);
      }
      cols.push('store_ids');
      values.push(storeIds);
    }
    if (await hasSupplierColumn()) {
      cols.push('supplier_id');
      values.push(p.supplier_id ?? null);
    }
    if (await hasDiscountColumns()) {
      cols.push('discount_type', 'discount_value');
      values.push(p.discount_type ?? null, p.discount_value ?? null);
    }
    if (await hasProductColumn('extra_barcodes')) {
      cols.push('extra_barcodes');
      values.push(normalizeExtraBarcodes(p.extra_barcodes, p.barcode ?? null));
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
