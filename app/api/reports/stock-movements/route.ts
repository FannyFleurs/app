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
    user_name: string | null; purchase_price_ht: string | null;
  }>(
    `SELECT m.id, m.created_at::text AS created_at, m.movement_type,
            m.quantity_delta::text, m.new_quantity::text,
            m.reason, m.source_type,
            p.name AS product, p.sku, p.purchase_price_ht::text,
            st.name AS store, u.full_name AS user_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN stores st ON st.id = m.store_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1
        AND ${DAY} BETWEEN $2::date AND $3::date
        -- Démarque uniquement : pertes et ajustements de stock (casse, jeté,
        -- volé, périmé, erreurs…). On exclut ventes, retours, réceptions,
        -- transferts et inventaires — ce ne sont pas de la démarque.
        AND m.movement_type IN ('loss', 'adjustment')
        ${storeFilter}
      ORDER BY m.created_at DESC
      LIMIT 2000`,
    args,
  );

  const lines = rows.map((r) => {
    const qty = Number(r.quantity_delta);
    const cost = r.purchase_price_ht != null ? Number(r.purchase_price_ht) : 0;
    // Valorisation au coût (prix d'achat HT) : montant = quantité × coût. Signé
    // comme la quantité (une perte, delta négatif, donne un montant négatif).
    const amount = Number((qty * cost).toFixed(2));
    return {
      id: r.id,
      date: r.created_at,
      type: r.movement_type,
      product: r.product,
      sku: r.sku,
      store: r.store,
      quantity_delta: qty,
      new_quantity: Number(r.new_quantity),
      amount,
      reason: r.reason,
      source_type: r.source_type,
      user: r.user_name,
    };
  });

  const total_amount = Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2));
  return NextResponse.json({ lines, total_amount, from, to, store_id: storeId });
}
