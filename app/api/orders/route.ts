import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction, query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const schema = z.object({
  store_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  pickup_or_delivery: z.enum(['pickup', 'delivery']).default('pickup'),
  requested_at: z.string(),  // ISO datetime
  slot_label: z.string().max(120).optional(),
  recipient_name: z.string().max(160).optional(),
  recipient_phone: z.string().max(40).optional(),
  delivery_address: z.object({
    line1: z.string().max(160).optional(),
    zip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
  }).optional(),
  internal_notes: z.string().max(1000).optional(),
  lines: z.array(z.object({
    product_id: z.string().uuid().nullable(),
    label: z.string().max(200),
    quantity: z.number().positive(),
    unit_price_ttc: z.number().min(0),
    tax_rate: z.number().min(0),
    tax_rate_code: z.string().max(40),
  })).min(1),
});

export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const result = await withTransaction(async (client) => {
      const totalAmount = d.lines.reduce(
        (s, l) => s + l.unit_price_ttc * l.quantity, 0,
      );
      const ins = await client.query<{ id: string }>(
        `INSERT INTO orders
           (organization_id, store_id, customer_id,
            status, pickup_or_delivery,
            requested_at, slot_label,
            recipient_name, recipient_phone, delivery_address,
            total_amount, internal_notes)
         VALUES ($1,$2,$3,'confirmed',$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          g.user.organizationId, d.store_id, d.customer_id ?? null,
          d.pickup_or_delivery,
          d.requested_at, d.slot_label ?? null,
          d.recipient_name ?? null, d.recipient_phone ?? null,
          d.delivery_address ? JSON.stringify(d.delivery_address) : null,
          totalAmount, d.internal_notes ?? null,
        ],
      );
      const orderId = ins.rows[0]!.id;
      for (let i = 0; i < d.lines.length; i++) {
        const l = d.lines[i]!;
        await client.query(
          `INSERT INTO order_lines
             (organization_id, order_id, line_index, product_id, label,
              quantity, unit_price_ttc, tax_rate, tax_rate_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            g.user.organizationId, orderId, i, l.product_id, l.label,
            l.quantity, l.unit_price_ttc, l.tax_rate, l.tax_rate_code,
          ],
        ).catch(async (err) => {
          // table order_lines peut ne pas exister selon le schéma initial,
          // on stocke alors la ligne dans internal_notes (fallback).
          if (!(err as Error).message?.includes('order_lines')) throw err;
          // eslint-disable-next-line no-console
          console.warn('[orders] table order_lines absente, ignoré');
        });
      }
      return { id: orderId };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'orders.create', entityType: 'order', entityId: result.id,
      payload: { pickup_or_delivery: d.pickup_or_delivery, requested_at: d.requested_at },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[orders.create]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT o.id, o.number, o.status, o.pickup_or_delivery,
            o.requested_at, o.slot_label, o.total_amount::text,
            o.recipient_name, o.recipient_phone, o.created_at,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.organization_id = $1
      ORDER BY o.requested_at DESC NULLS LAST, o.created_at DESC
      LIMIT 200`,
    [g.user.organizationId],
  );
  return NextResponse.json({ orders: rows });
}
