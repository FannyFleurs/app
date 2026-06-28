import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const STATUSES = ['draft','confirmed','in_preparation','ready','delivered','cancelled'] as const;

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  recipient_name: z.string().max(120).optional().nullable(),
  recipient_phone: z.string().max(40).optional().nullable(),
  internal_notes: z.string().max(1000).optional().nullable(),
  card_message: z.string().max(500).optional().nullable(),
  slot_label: z.string().max(80).optional().nullable(),
  requested_at: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT o.*, c.email AS customer_email, c.phone AS customer_phone,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1 AND o.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (rows.length === 0) return jsonError('NOT_FOUND', 404);

  // Récupère aussi les lignes
  const lines = await query(
    `SELECT id, product_id, label, quantity, unit_price_ttc, tax_rate, tax_rate_code
       FROM order_lines WHERE order_id = $1 ORDER BY line_index`,
    [params.id],
  );
  return NextResponse.json({ order: rows[0], lines: lines.rows });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const p = parsed.data;

  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 1) return NextResponse.json({ ok: true });

  vals.push(params.id, g.user.organizationId);
  const r = await query(
    `UPDATE orders SET ${sets.join(', ')}
      WHERE id = $${i++} AND organization_id = $${i}`,
    vals,
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'orders.update', entityType: 'order', entityId: params.id,
    payload: p,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  // Soft cancel : on passe en status='cancelled' (jamais de hard delete sur
  // une commande qui peut avoir des lignes / paiements liés).
  const r = await query(
    `UPDATE orders SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);
  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'orders.cancel', entityType: 'order', entityId: params.id,
    payload: {},
  });
  return NextResponse.json({ ok: true });
}
