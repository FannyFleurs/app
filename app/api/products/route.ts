import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const productSchema = z.object({
  name: z.string().min(1).max(200),
  short_description: z.string().max(500).optional(),
  long_description: z.string().max(5000).optional(),
  category_id: z.string().uuid().optional().nullable(),
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
  tags: z.array(z.string()).default([]),
});

export async function GET(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const onlyActive = url.searchParams.get('active') !== 'false';
  const inPos = url.searchParams.get('pos') === '1';

  const params: unknown[] = [g.user.organizationId];
  let where = `p.organization_id = $1`;
  if (onlyActive) where += ` AND p.is_active = TRUE`;
  if (inPos) where += ` AND p.visible_in_pos = TRUE`;
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    params.push(q);
    where += ` AND (lower(p.name) LIKE $${params.length - 1} OR p.barcode = $${params.length} OR p.sku = $${params.length})`;
  }

  const { rows } = await query(
    `SELECT p.id, p.name, p.short_description, p.sku, p.barcode, p.image_url, p.unit,
            p.sale_price_ttc, p.price_is_free, p.category_id, p.visible_in_pos, p.is_active,
            p.tags, p.is_seasonal, p.is_customizable,
            t.rate AS tax_rate, t.id AS tax_rate_id, t.code AS tax_rate_code, t.label AS tax_rate_label,
            c.name AS category_name, c.color AS category_color
       FROM products p
       JOIN tax_rates t ON t.id = p.tax_rate_id
       LEFT JOIN product_categories c ON c.id = p.category_id
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

  const ins = await query<{ id: string }>(
    `INSERT INTO products
      (organization_id, name, short_description, long_description, category_id,
       sku, barcode, supplier_ref, image_url, unit, tax_rate_id, purchase_price_ht,
       sale_price_ttc, price_is_free, track_stock, min_stock, max_stock,
       is_seasonal, is_customizable, visible_in_pos, is_active, tags,
       created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
     RETURNING id`,
    [
      g.user.organizationId, p.name, p.short_description ?? null, p.long_description ?? null,
      p.category_id ?? null, p.sku ?? null, p.barcode ?? null, p.supplier_ref ?? null,
      p.image_url ?? null, p.unit, p.tax_rate_id, p.purchase_price_ht ?? null,
      p.sale_price_ttc, p.price_is_free, p.track_stock, p.min_stock ?? null, p.max_stock ?? null,
      p.is_seasonal, p.is_customizable, p.visible_in_pos, p.is_active, p.tags,
      g.user.id,
    ],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.create', entityType: 'product', entityId: ins.rows[0]!.id,
    payload: { name: p.name },
  });

  return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
}
