import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/** Articles d'une réception, à réceptionner depuis le PDA. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;

  const reception = await query<{ filename: string | null }>(
    `SELECT filename FROM receptions WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (reception.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const { rows } = await query<{
    product_id: string; name: string; sku: string | null; barcode: string | null;
    category_name: string | null; received_qty: string | null;
  }>(
    `SELECT ri.product_id, p.name, p.sku, p.barcode, c.name AS category_name,
            ri.received_qty::text
       FROM reception_items ri
       JOIN products p ON p.id = ri.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE ri.reception_id = $1
      ORDER BY (ri.received_qty IS NOT NULL), p.name`,
    [params.id],
  );

  return NextResponse.json({
    filename: reception.rows[0]!.filename,
    items: rows.map((r) => ({
      product_id: r.product_id,
      name: r.name,
      sku: r.sku,
      barcode: r.barcode,
      category_name: r.category_name,
      received_qty: r.received_qty != null ? Number(r.received_qty) : null,
    })),
  });
}

const receiveSchema = z.object({
  product_id: z.string().uuid(),
  received_qty: z.number().positive(),
  // Code-barres saisi au moment de la réception — UNIQUEMENT si l'article
  // n'en avait pas déjà un (voir fiche article). Jamais une correction.
  barcode: z.string().trim().min(1).max(100).optional(),
});

/**
 * Marque un article de la réception comme réceptionné. N'écrit PAS le
 * mouvement de stock lui-même : le PDA appelle d'abord /api/stock/movement
 * (chemin partagé avec « Entrée de marchandise »), puis cette route pour
 * que l'article sorte de la liste « à réceptionner ».
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, receiveSchema);
  if ('response' in parsed) return parsed.response;

  const reception = await query(
    `SELECT 1 FROM receptions WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (reception.rowCount === 0) return jsonError('NOT_FOUND', 404);

  if (parsed.data.barcode) {
    const product = await query<{ barcode: string | null }>(
      `SELECT barcode FROM products WHERE id = $1 AND organization_id = $2`,
      [parsed.data.product_id, g.user.organizationId],
    );
    if (product.rowCount === 0) return jsonError('PRODUCT_NOT_FOUND', 404);
    if (product.rows[0]!.barcode) return jsonError('BARCODE_ALREADY_SET', 409);

    const dup = await query(
      `SELECT 1 FROM products WHERE organization_id = $1 AND barcode = $2 AND id != $3`,
      [g.user.organizationId, parsed.data.barcode, parsed.data.product_id],
    );
    if ((dup.rowCount ?? 0) > 0) return jsonError('BARCODE_ALREADY_USED', 409);

    await query(`UPDATE products SET barcode = $1 WHERE id = $2`, [parsed.data.barcode, parsed.data.product_id]);
  }

  const upd = await query(
    `UPDATE reception_items
        SET received_qty = $1, received_at = now(), received_by = $2
      WHERE reception_id = $3 AND product_id = $4
      RETURNING id`,
    [parsed.data.received_qty, g.user.id, params.id, parsed.data.product_id],
  );
  if (upd.rowCount === 0) return jsonError('ITEM_NOT_FOUND', 404);

  return NextResponse.json({ ok: true });
}
