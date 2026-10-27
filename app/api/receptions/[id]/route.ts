import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/** Détail d'une réception : ses articles, chacun avec son état de réception. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  const reception = await query<{
    id: string; filename: string | null; store_ids: string[]; sent_to_pda: boolean; created_at: string;
  }>(
    `SELECT id, filename, store_ids, sent_to_pda, created_at::text
       FROM receptions WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (reception.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const items = await query<{
    product_id: string; name: string; sku: string | null; barcode: string | null;
    received_qty: string | null;
  }>(
    `SELECT ri.product_id, p.name, p.sku, p.barcode, ri.received_qty::text
       FROM reception_items ri
       JOIN products p ON p.id = ri.product_id
      WHERE ri.reception_id = $1
      ORDER BY p.name`,
    [params.id],
  );

  return NextResponse.json({
    ...reception.rows[0],
    started: items.rows.some((i) => i.received_qty !== null),
    items: items.rows.map((i) => ({
      product_id: i.product_id, name: i.name, sku: i.sku, barcode: i.barcode,
      received_qty: i.received_qty != null ? Number(i.received_qty) : null,
    })),
  });
}

const patchSchema = z.object({
  sent_to_pda: z.boolean().optional(),
  product_ids: z.array(z.string().uuid()).min(1).max(5000).optional(),
});

/**
 * Modifie une réception. `product_ids`, s'il est fourni, REMPLACE la liste
 * des références — refusé dès qu'UN SEUL article a été réceptionné sur le
 * PDA (`started`), pour ne jamais faire disparaître un article déjà reçu ou
 * en changer la quantité sous les pieds du PDA.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;

  const existing = await query(
    `SELECT 1 FROM receptions WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (existing.rowCount === 0) return jsonError('NOT_FOUND', 404);

  if (parsed.data.product_ids) {
    const started = await query(
      `SELECT 1 FROM reception_items WHERE reception_id = $1 AND received_qty IS NOT NULL LIMIT 1`,
      [params.id],
    );
    if ((started.rowCount ?? 0) > 0) return jsonError('RECEPTION_STARTED', 409);

    const owned = await query<{ id: string }>(
      `SELECT id FROM products WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [g.user.organizationId, parsed.data.product_ids],
    );
    const ownedIds = new Set(owned.rows.map((r) => r.id));
    const productIds = parsed.data.product_ids.filter((id) => ownedIds.has(id));
    if (productIds.length === 0) return jsonError('NO_VALID_PRODUCTS', 422);

    await query(`DELETE FROM reception_items WHERE reception_id = $1`, [params.id]);
    const values: string[] = [];
    const vparams: unknown[] = [];
    productIds.forEach((pid, i) => {
      values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
      vparams.push(params.id, pid);
    });
    await query(
      `INSERT INTO reception_items (reception_id, product_id) VALUES ${values.join(',')}`,
      vparams,
    );
    await query(`UPDATE receptions SET product_count = $1 WHERE id = $2`, [productIds.length, params.id]);
  }

  if (parsed.data.sent_to_pda !== undefined) {
    await query(`UPDATE receptions SET sent_to_pda = $1 WHERE id = $2`, [parsed.data.sent_to_pda, params.id]);
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'receptions.update', entityType: 'reception', entityId: params.id,
    payload: { sent_to_pda: parsed.data.sent_to_pda, product_count: parsed.data.product_ids?.length },
  });

  return NextResponse.json({ ok: true });
}
