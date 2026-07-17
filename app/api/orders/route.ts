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

  // Introspection : on adapte les SELECT aux colonnes optionnelles ajoutées
  // par les migrations (0016 stripe sur orders, 0019 delivery_info sur sales,
  // 0020 stripe sur sales, 0021 prep_status sur sales).
  const colCheck = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'orders'
              AND column_name IN ('payment_status','payment_link_url','paid_at'))
         OR (table_name = 'sales'
              AND column_name IN ('payment_status','payment_link_url','paid_at',
                                  'delivery_info','prep_status'))`,
  );
  const has = (t: string, c: string) =>
    colCheck.rows.some((r) => r.table_name === t && r.column_name === c);
  const ordersHasStripe = has('orders', 'payment_status');
  const salesHasDelivery = has('sales', 'delivery_info');
  const salesHasPrep = has('sales', 'prep_status');
  const salesHasStripe = has('sales', 'payment_status');

  const ordersStripeCols = ordersHasStripe
    ? `, o.payment_status, o.payment_link_url, o.paid_at`
    : `, NULL::text AS payment_status, NULL::text AS payment_link_url, NULL::timestamptz AS paid_at`;

  // 1) Source orders
  const ordersRes = await query(
    `SELECT 'order'::text AS source,
            o.id, o.number, o.status, o.pickup_or_delivery,
            o.requested_at, o.slot_label,
            o.total_amount::text, o.deposit_amount::text,
            o.recipient_name, o.recipient_phone,
            o.delivery_address, o.internal_notes, o.card_message,
            o.created_at,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
            c.email AS customer_email, c.phone AS customer_phone,
            c.id AS customer_id
            ${ordersStripeCols}
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.organization_id = $1
      ORDER BY o.requested_at DESC NULLS LAST, o.created_at DESC
      LIMIT 200`,
    [g.user.organizationId],
  );

  let salesRows: Record<string, unknown>[] = [];
  // 2) Source sales avec delivery_info (vente caisse encaissée + retrait/livraison)
  if (salesHasDelivery) {
    const prepCol = salesHasPrep
      ? `COALESCE(s.prep_status, 'confirmed')`
      : `'confirmed'`;
    const salesStripeCols = salesHasStripe
      // Une vente encaissée au comptoir est payée. La colonne payment_status
      // (Stripe) ne vaut 'paid' que pour les paiements par lien ; on ne
      // considère « impayée » qu'une vente avec un lien de paiement encore en
      // attente. Toute autre vente validée = payée.
      ? `, CASE WHEN s.payment_status = 'paid' THEN 'paid'
                WHEN s.payment_link_url IS NOT NULL THEN COALESCE(s.payment_status, 'pending')
                ELSE 'paid' END AS payment_status,
         s.payment_link_url,
         COALESCE(s.paid_at, s.validated_at) AS paid_at`
      // Si pas Stripe sur sales : sale validée = payée
      : `, 'paid'::text AS payment_status, NULL::text AS payment_link_url, s.validated_at AS paid_at`;

    const res = await query(
      `SELECT 'sale'::text AS source,
              s.id,
              r.number AS number,
              ${prepCol} AS status,
              (s.delivery_info->>'pickup_or_delivery') AS pickup_or_delivery,
              (s.delivery_info->>'requested_at')::timestamptz AS requested_at,
              (s.delivery_info->>'slot_label') AS slot_label,
              s.total_ttc::text AS total_amount,
              '0'::text AS deposit_amount,
              (s.delivery_info->>'recipient_name') AS recipient_name,
              (s.delivery_info->>'recipient_phone') AS recipient_phone,
              (s.delivery_info->'delivery_address') AS delivery_address,
              (s.delivery_info->>'internal_notes') AS internal_notes,
              NULL::text AS card_message,
              s.created_at,
              COALESCE(c.company_name,
                NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
              c.email AS customer_email, c.phone AS customer_phone,
              c.id AS customer_id
              ${salesStripeCols}
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN receipts r ON r.sale_id = s.id
        WHERE s.organization_id = $1
          AND s.delivery_info IS NOT NULL
        ORDER BY (s.delivery_info->>'requested_at')::timestamptz DESC NULLS LAST,
                 s.created_at DESC
        LIMIT 200`,
      [g.user.organizationId],
    );
    salesRows = res.rows as Record<string, unknown>[];
  }

  // Fusion + tri par requested_at desc puis created_at desc
  const merged = [...ordersRes.rows, ...salesRows].sort((a, b) => {
    const ar = a.requested_at as string | null;
    const br = b.requested_at as string | null;
    if (ar && br) return new Date(br).getTime() - new Date(ar).getTime();
    if (ar) return -1;
    if (br) return 1;
    return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime();
  }).slice(0, 200);

  return NextResponse.json({ orders: merged });
}
