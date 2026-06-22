import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

const schema = z.object({
  customer_id: z.string().uuid().nullable(),
});

/**
 * Attache (ou détache) un client à une vente.
 * Autorisé uniquement tant que la vente est en brouillon ou mise en attente —
 * une vente validée est immuable, conformément au trigger fn_protect_validated_sale.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  // Vérifie le statut
  const sale = await query<{ status: string }>(
    `SELECT status FROM sales WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (sale.rowCount === 0) return jsonError('SALE_NOT_FOUND', 404);
  if (sale.rows[0]!.status !== 'draft' && sale.rows[0]!.status !== 'on_hold') {
    return jsonError('SALE_NOT_EDITABLE', 409);
  }

  // Vérifie l'appartenance du client si non null
  if (parsed.data.customer_id) {
    const c = await query(
      `SELECT 1 FROM customers WHERE id = $1 AND organization_id = $2`,
      [parsed.data.customer_id, g.user.organizationId],
    );
    if (c.rowCount === 0) return jsonError('CUSTOMER_NOT_FOUND', 404);
  }

  await query(
    `UPDATE sales SET customer_id = $1, updated_at = now()
      WHERE id = $2 AND organization_id = $3`,
    [parsed.data.customer_id, params.id, g.user.organizationId],
  );
  return NextResponse.json({ ok: true });
}
