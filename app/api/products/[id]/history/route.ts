import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';

export const dynamic = 'force-dynamic';

// Historique complet d'un article : mouvements de stock (entrées, sorties,
// ventes avec n° de ticket, déstockages, pertes, inventaires, transferts avec
// la boutique de contrepartie) + changements de prix. Trié du plus récent au
// plus ancien. La recherche se fait côté client sur ce jeu borné.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const org = g.user.organizationId;
  const productId = params.id;
  // Isolation boutique : sur un poste de caisse appairé, l'historique des
  // MOUVEMENTS de stock (ventes, entrées, pertes…) est limité à la boutique
  // du poste — chaque boutique est autonome. Null (back-office / poste non
  // appairé) => tous mouvements. (Les changements de prix sont au niveau org.)
  const storeId = await resolveDeviceStoreId(org);

  const movements = await query<{
    id: string; movement_type: string; quantity_delta: string; new_quantity: string;
    reason: string | null; created_at: string; store_name: string;
    user_name: string | null; source_type: string | null; source_id: string | null;
    receipt_number: string | null; sale_id: string | null;
    counterpart_store: string | null;
  }>(
    `SELECT m.id, m.movement_type,
            m.quantity_delta::text, m.new_quantity::text,
            m.reason, m.created_at,
            st.name AS store_name,
            u.full_name AS user_name,
            m.source_type, m.source_id::text,
            sale.receipt_number,
            sale.id::text AS sale_id,
            cp.name AS counterpart_store
       FROM stock_movements m
       JOIN stores st ON st.id = m.store_id
       LEFT JOIN users u ON u.id = m.user_id
       -- Vente : source_type='sale', source_id -> sales.id
       LEFT JOIN sales sale
         ON m.source_type = 'sale' AND sale.id = m.source_id
       -- Transfert sortant : la contrepartie est le transfert entrant dont
       -- le source_id pointe vers CE mouvement.
       LEFT JOIN stock_movements tin
         ON m.movement_type = 'transfer_out' AND tin.source_id = m.id
       -- Transfert entrant : la contrepartie est le mouvement sortant pointé
       -- par notre source_id.
       LEFT JOIN stock_movements tout
         ON m.movement_type = 'transfer_in' AND tout.id = m.source_id
       LEFT JOIN stores cp
         ON cp.id = COALESCE(tin.store_id, tout.store_id)
      WHERE m.organization_id = $1 AND m.product_id = $2
        AND ($3::uuid IS NULL OR m.store_id = $3)
      ORDER BY m.created_at DESC
      LIMIT 500`,
    [org, productId, storeId],
  );

  const prices = await query<{
    id: string; old_price_ttc: string | null; new_price_ttc: string;
    reason: string | null; created_at: string; user_name: string | null;
  }>(
    `SELECT ph.id, ph.old_price_ttc::text, ph.new_price_ttc::text,
            ph.reason, ph.created_at, u.full_name AS user_name
       FROM product_price_history ph
       LEFT JOIN users u ON u.id = ph.user_id
      WHERE ph.organization_id = $1 AND ph.product_id = $2
      ORDER BY ph.created_at DESC
      LIMIT 500`,
    [org, productId],
  );

  const stockEntries = movements.rows.map((m) => ({
    id: m.id,
    kind: 'stock' as const,
    movement_type: m.movement_type,
    quantity_delta: Number(m.quantity_delta),
    new_quantity: Number(m.new_quantity),
    reason: m.reason,
    created_at: m.created_at,
    store_name: m.store_name,
    user_name: m.user_name,
    receipt_number: m.receipt_number,
    sale_id: m.sale_id,
    counterpart_store: m.counterpart_store,
  }));

  const priceEntries = prices.rows.map((p) => ({
    id: p.id,
    kind: 'price' as const,
    old_price_ttc: p.old_price_ttc ? Number(p.old_price_ttc) : null,
    new_price_ttc: Number(p.new_price_ttc),
    reason: p.reason,
    created_at: p.created_at,
    user_name: p.user_name,
  }));

  const entries = [...stockEntries, ...priceEntries].sort(
    (a, b) => (a.created_at < b.created_at ? 1 : -1),
  );

  return NextResponse.json({ entries });
}
