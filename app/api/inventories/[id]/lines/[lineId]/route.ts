import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  counted_qty: z.number().min(0),
});

/**
 * Ajustement manuel d'une ligne (utilise en phase de revue apres le
 * scan pour corriger les ecarts).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; lineId: string } },
) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const inv = await query<{ status: string }>(
    `SELECT status FROM inventories WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (inv.rowCount === 0) return jsonError('NOT_FOUND', 404);
  if (inv.rows[0]!.status === 'finalized' || inv.rows[0]!.status === 'cancelled') {
    return jsonError('INVENTORY_LOCKED', 409);
  }

  const r = await query(
    `UPDATE inventory_lines
        SET counted_qty = $1, updated_at = now()
      WHERE id = $2 AND inventory_id = $3`,
    [parsed.data.counted_qty, params.lineId, params.id],
  );
  if (r.rowCount === 0) return jsonError('LINE_NOT_FOUND', 404);

  await query(`UPDATE inventories SET updated_at = now() WHERE id = $1`, [params.id]);
  return NextResponse.json({ ok: true });
}
