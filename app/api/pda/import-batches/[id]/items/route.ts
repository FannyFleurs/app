import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/** Articles d'un lot d'import, à réceptionner depuis le PDA. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;

  const batch = await query<{ filename: string | null }>(
    `SELECT filename FROM import_batches WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (batch.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const { rows } = await query<{
    product_id: string; name: string; sku: string | null; barcode: string | null;
    category_name: string | null; received_qty: string | null;
  }>(
    `SELECT ibi.product_id, p.name, p.sku, p.barcode, c.name AS category_name,
            ibi.received_qty::text
       FROM import_batch_items ibi
       JOIN products p ON p.id = ibi.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE ibi.import_batch_id = $1
      ORDER BY (ibi.received_qty IS NOT NULL), p.name`,
    [params.id],
  );

  return NextResponse.json({
    filename: batch.rows[0]!.filename,
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
});

/**
 * Marque un article du lot comme réceptionné. N'écrit PAS le mouvement de
 * stock lui-même : le PDA appelle d'abord /api/stock/movement (chemin
 * partagé avec « Entrée de marchandise »), puis cette route pour que
 * l'article sorte de la liste « à réceptionner ».
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, receiveSchema);
  if ('response' in parsed) return parsed.response;

  const batch = await query(
    `SELECT 1 FROM import_batches WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (batch.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const upd = await query(
    `UPDATE import_batch_items
        SET received_qty = $1, received_at = now(), received_by = $2
      WHERE import_batch_id = $3 AND product_id = $4
      RETURNING id`,
    [parsed.data.received_qty, g.user.id, params.id, parsed.data.product_id],
  );
  if (upd.rowCount === 0) return jsonError('ITEM_NOT_FOUND', 404);

  return NextResponse.json({ ok: true });
}
