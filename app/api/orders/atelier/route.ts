import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Écran atelier (préparation) : liste unifiée des commandes différées
 * (table orders) ET des ventes caisse retrait/livraison (sales.delivery_info)
 * dans la fenêtre de visibilité hier → J+5, avec leurs lignes et le n°
 * attribué à chaque composition. POST = actions de l'écran (en cours /
 * préparée + numéros / livrée).
 */

interface AtelierLine {
  line_index: number;
  label: string;
  quantity: number;
  prepared_number: string | null;
}

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id') || null;

  // Fenêtre : hier (en retard) → aujourd'hui + 5 jours.
  const windowSql = `BETWEEN (CURRENT_DATE - 1) AND (CURRENT_DATE + 5)`;

  // 1) Commandes différées
  const storeFilterO = storeId ? 'AND o.store_id = $2' : '';
  const argsO: unknown[] = storeId ? [g.user.organizationId, storeId] : [g.user.organizationId];
  const ordersRes = await query<{
    id: string; status: string; pickup_or_delivery: string;
    requested_at: string | null; slot_label: string | null;
    total_amount: string; deposit_amount: string;
    recipient_name: string | null; internal_notes: string | null;
    card_message: string | null; payment_status: string | null;
    customer_name: string | null; store_name: string | null;
  }>(
    `SELECT o.id, o.status, o.pickup_or_delivery, o.requested_at, o.slot_label,
            o.total_amount::text, o.deposit_amount::text,
            o.recipient_name, o.internal_notes, o.card_message,
            NULL::text AS payment_status,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
            st.name AS store_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN stores st ON st.id = o.store_id
      WHERE o.organization_id = $1
        AND o.status IN ('confirmed','in_preparation','ready')
        AND o.requested_at::date ${windowSql}
        ${storeFilterO}
      ORDER BY o.requested_at ASC NULLS LAST
      LIMIT 200`,
    argsO,
  );

  const orderIds = ordersRes.rows.map((o) => o.id);
  const linesByOrder = new Map<string, AtelierLine[]>();
  if (orderIds.length > 0) {
    const linesRes = await query<{
      order_id: string; line_index: number; label: string;
      quantity: string; prepared_number: string | null;
    }>(
      `SELECT order_id, line_index, label, quantity::text, prepared_number
         FROM order_lines
        WHERE order_id = ANY($1::uuid[])
        ORDER BY order_id, line_index`,
      [orderIds],
    ).catch(() => ({ rows: [] as never[] }));
    for (const l of linesRes.rows) {
      const arr = linesByOrder.get(l.order_id) ?? [];
      arr.push({
        line_index: l.line_index, label: l.label,
        quantity: Number(l.quantity), prepared_number: l.prepared_number,
      });
      linesByOrder.set(l.order_id, arr);
    }
  }

  // 2) Ventes caisse retrait/livraison (delivery_info + prep_status).
  const storeFilterS = storeId ? 'AND s.store_id = $2' : '';
  let saleItems: Record<string, unknown>[] = [];
  try {
    const salesRes = await query<{
      id: string; prep_status: string | null; pickup_or_delivery: string | null;
      requested_at: string | null; slot_label: string | null;
      total_amount: string; recipient_name: string | null;
      internal_notes: string | null; prepared_numbers: Record<string, string> | null;
      customer_name: string | null; store_name: string | null;
      receipt_number: string | null;
    }>(
      `SELECT s.id,
              COALESCE(s.prep_status, 'confirmed') AS prep_status,
              (s.delivery_info->>'pickup_or_delivery') AS pickup_or_delivery,
              (s.delivery_info->>'requested_at') AS requested_at,
              (s.delivery_info->>'slot_label') AS slot_label,
              s.total_ttc::text AS total_amount,
              (s.delivery_info->>'recipient_name') AS recipient_name,
              (s.delivery_info->>'internal_notes') AS internal_notes,
              (s.delivery_info->'prepared_numbers') AS prepared_numbers,
              COALESCE(c.company_name,
                NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
              st.name AS store_name,
              s.receipt_number
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN stores st ON st.id = s.store_id
        WHERE s.organization_id = $1
          AND s.delivery_info IS NOT NULL
          AND COALESCE(s.prep_status, 'confirmed') IN ('confirmed','in_preparation','ready')
          AND ((s.delivery_info->>'requested_at')::timestamptz)::date ${windowSql}
          ${storeFilterS}
        ORDER BY (s.delivery_info->>'requested_at')::timestamptz ASC
        LIMIT 200`,
      storeId ? [g.user.organizationId, storeId] : [g.user.organizationId],
    );
    const saleIds = salesRes.rows.map((s) => s.id);
    const saleLines = new Map<string, AtelierLine[]>();
    if (saleIds.length > 0) {
      const lr = await query<{
        sale_id: string; line_index: number; label: string; quantity: string;
      }>(
        `SELECT sale_id, line_index, label, quantity::text
           FROM sale_lines WHERE sale_id = ANY($1::uuid[])
          ORDER BY sale_id, line_index`,
        [saleIds],
      );
      for (const l of lr.rows) {
        const arr = saleLines.get(l.sale_id) ?? [];
        arr.push({ line_index: l.line_index, label: l.label, quantity: Number(l.quantity), prepared_number: null });
        saleLines.set(l.sale_id, arr);
      }
    }
    saleItems = salesRes.rows.map((s) => ({
      source: 'sale',
      id: s.id,
      status: s.prep_status,
      pickup_or_delivery: s.pickup_or_delivery ?? 'pickup',
      requested_at: s.requested_at,
      slot_label: s.slot_label,
      total_amount: s.total_amount,
      deposit_amount: '0',
      recipient_name: s.recipient_name,
      internal_notes: s.internal_notes,
      card_message: null,
      payment_status: 'paid', // vente caisse déjà encaissée
      customer_name: s.customer_name,
      store_name: s.store_name,
      number: s.receipt_number,
      lines: (saleLines.get(s.id) ?? []).map((l) => ({
        ...l,
        prepared_number: s.prepared_numbers?.[String(l.line_index)] ?? null,
      })),
    }));
  } catch { /* migrations 0019/0021 absentes : uniquement les commandes */ }

  const orderItems = ordersRes.rows.map((o) => ({
    source: 'order',
    ...o,
    number: null,
    lines: linesByOrder.get(o.id) ?? [],
  }));

  const items = [...orderItems, ...saleItems].sort((a, b) => {
    const ar = (a as { requested_at?: string | null }).requested_at;
    const br = (b as { requested_at?: string | null }).requested_at;
    if (ar && br) return new Date(ar).getTime() - new Date(br).getTime();
    return ar ? -1 : 1;
  });

  return NextResponse.json({ items });
}

const actionSchema = z.object({
  source: z.enum(['order', 'sale']),
  id: z.string().uuid(),
  action: z.enum(['in_preparation', 'ready', 'delivered']),
  /** Numéros attribués par ligne (requis avec action='ready'). */
  numbers: z.array(z.object({
    line_index: z.number().int().nonnegative(),
    prepared_number: z.string().max(40),
  })).optional(),
});

export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, actionSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
  await withTransaction(async (client) => {
    if (d.source === 'order') {
      const r = await client.query(
        `UPDATE orders SET status = $1, updated_at = now()
          WHERE id = $2 AND organization_id = $3`,
        [d.action, d.id, g.user.organizationId],
      );
      if (r.rowCount === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (d.numbers) {
        for (const n of d.numbers) {
          await client.query(
            `UPDATE order_lines SET prepared_number = $1
              WHERE order_id = $2 AND line_index = $3 AND organization_id = $4`,
            [n.prepared_number || null, d.id, n.line_index, g.user.organizationId],
          ).catch(() => { /* colonne absente (migration 0043) : statut seul */ });
        }
      }
    } else {
      // Vente caisse : prep_status + numéros dans delivery_info (non fiscal).
      const numbersJson = d.numbers
        ? JSON.stringify(Object.fromEntries(d.numbers.map((n) => [String(n.line_index), n.prepared_number])))
        : null;
      const r = await client.query(
        `UPDATE sales
            SET prep_status = $1,
                delivery_info = CASE WHEN $2::jsonb IS NULL THEN delivery_info
                  ELSE jsonb_set(COALESCE(delivery_info, '{}'::jsonb), '{prepared_numbers}', $2::jsonb) END,
                updated_at = now()
          WHERE id = $3 AND organization_id = $4 AND delivery_info IS NOT NULL`,
        [d.action, numbersJson, d.id, g.user.organizationId],
      );
      if (r.rowCount === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    }
  });
  } catch (e) {
    const err = e as Error & { status?: number };
    return jsonError(err.message, err.status ?? 400);
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'atelier.update', entityType: d.source, entityId: d.id,
    payload: { action: d.action, numbers: d.numbers ?? null },
  });
  return NextResponse.json({ ok: true });
}
