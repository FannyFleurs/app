import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().min(1).max(200).optional(),
  product_id: z.string().uuid().optional(),
  delta: z.number().default(1),
}).refine((d) => d.code || d.product_id, { message: 'code or product_id required' });

/**
 * Ajoute un scan. On accepte soit un code (barcode/sku) qu'on resout,
 * soit un product_id direct. On incremente counted_qty de la ligne
 * correspondante ; si la ligne n'existe pas (produit hors scope initial),
 * on la cree avec expected_qty=0.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const inv = await query<{ status: string; store_id: string }>(
    `SELECT status, store_id FROM inventories WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (inv.rowCount === 0) return jsonError('NOT_FOUND', 404);
  if (inv.rows[0]!.status === 'finalized' || inv.rows[0]!.status === 'cancelled') {
    return jsonError('INVENTORY_LOCKED', 409);
  }

  // Resout le produit
  let productId = d.product_id ?? null;
  if (!productId && d.code) {
    // Résolution multi-EAN : code principal, SKU, ou l'un des codes
    // supplémentaires (colonne extra_barcodes, migration 0063). On teste la
    // présence de la colonne pour rester compatible si la migration n'a pas
    // encore tourné.
    const hasExtra = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'extra_barcodes'
       ) AS exists`,
    );
    const extraClause = hasExtra.rows[0]?.exists
      ? ` OR extra_barcodes @> ARRAY[$2]::text[]` : '';
    const p = await query<{ id: string }>(
      `SELECT id FROM products
        WHERE organization_id = $1
          AND is_active = TRUE
          AND (barcode = $2 OR sku = $2 OR UPPER(barcode) = UPPER($2) OR UPPER(sku) = UPPER($2)${extraClause})
        LIMIT 1`,
      [g.user.organizationId, d.code],
    );
    productId = p.rows[0]?.id ?? null;
  }
  if (!productId) return jsonError('PRODUCT_NOT_FOUND', 404);

  // Incremente ou cree la ligne. Le expected_qty (si creation) vient
  // du stock_levels courant pour le store de l'inventaire.
  const line = await query<{
    id: string; expected_qty: string; counted_qty: string;
    product_name: string;
  }>(
    `WITH ins AS (
       INSERT INTO inventory_lines
         (inventory_id, product_id, expected_qty, counted_qty, purchase_price_ht)
       SELECT $1, p.id,
              COALESCE(sl.quantity, 0), $3, p.purchase_price_ht
         FROM products p
         LEFT JOIN stock_levels sl
           ON sl.product_id = p.id AND sl.store_id = $4 AND sl.organization_id = $5
        WHERE p.id = $2
       ON CONFLICT (inventory_id, product_id) DO UPDATE
          SET counted_qty = inventory_lines.counted_qty + EXCLUDED.counted_qty,
              updated_at  = now()
       RETURNING id, expected_qty::text, counted_qty::text, product_id
     )
     SELECT ins.id, ins.expected_qty, ins.counted_qty, p.name AS product_name
       FROM ins JOIN products p ON p.id = ins.product_id`,
    [params.id, productId, d.delta, inv.rows[0]!.store_id, g.user.organizationId],
  );

  await query(
    `UPDATE inventories SET updated_at = now() WHERE id = $1`,
    [params.id],
  );

  return NextResponse.json({ line: line.rows[0] });
}
