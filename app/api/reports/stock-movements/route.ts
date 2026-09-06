import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { reportRange, localDay } from '@/lib/reports/range';

export const dynamic = 'force-dynamic';

/**
 * Démarque / mouvements de stock.
 *
 * Tous les mouvements de stock de la période : pertes, ajustements, réceptions,
 * transferts, ventes, retours, inventaires. Le client filtre par type pour
 * isoler la démarque (ce qu'on jette, ce qui est cassé, volé…). Le motif reste
 * pour l'instant en texte libre (étape 2 : motifs structurés).
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const range = reportRange(req, g.user.organizationId);
  if ('response' in range) return range.response;
  const { from, to, storeId, args } = range;
  const storeFilter = storeId ? 'AND m.store_id = $4' : '';
  const DAY = localDay('m.created_at');

  const { rows } = await query<{
    id: string; created_at: string; movement_type: string;
    quantity_delta: string; new_quantity: string;
    reason: string | null; source_type: string | null;
    product: string; sku: string | null; store: string | null;
    user_name: string | null;
  }>(
    `SELECT m.id, m.created_at::text AS created_at, m.movement_type,
            m.quantity_delta::text, m.new_quantity::text,
            m.reason, m.source_type,
            p.name AS product, p.sku,
            st.name AS store, u.full_name AS user_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN stores st ON st.id = m.store_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1
        AND ${DAY} BETWEEN $2::date AND $3::date
        ${storeFilter}
      ORDER BY m.created_at DESC
      LIMIT 2000`,
    args,
  );

  const lines = rows.map((r) => ({
    id: r.id,
    date: r.created_at,
    type: r.movement_type,
    product: r.product,
    sku: r.sku,
    store: r.store,
    quantity_delta: Number(r.quantity_delta),
    new_quantity: Number(r.new_quantity),
    reason: r.reason,
    source_type: r.source_type,
    user: r.user_name,
  }));

  return NextResponse.json({ lines, from, to, store_id: storeId });
}
