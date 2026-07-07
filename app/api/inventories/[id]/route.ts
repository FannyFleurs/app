import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Detail d'un inventaire : entete + toutes les lignes.
 * Chaque ligne inclut le libelle produit et le calcul du delta.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  const inv = await query<{
    id: string; label: string; store_id: string; store_name: string;
    scope_type: string; scope_ids: string[]; status: string;
    created_at: string; finalized_at: string | null;
  }>(
    `SELECT i.id, i.label, i.store_id, s.name AS store_name,
            i.scope_type, i.scope_ids, i.status,
            i.created_at, i.finalized_at
       FROM inventories i
       LEFT JOIN stores s ON s.id = i.store_id
      WHERE i.id = $1 AND i.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (inv.rowCount === 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const lines = await query<{
    id: string; product_id: string; product_name: string;
    sku: string | null; barcode: string | null;
    category_name: string | null; supplier_ref: string | null;
    expected_qty: string; counted_qty: string;
    purchase_price_ht: string | null;
  }>(
    `SELECT il.id, il.product_id, p.name AS product_name,
            p.sku, p.barcode, p.supplier_ref,
            c.name AS category_name,
            il.expected_qty::text, il.counted_qty::text,
            il.purchase_price_ht::text
       FROM inventory_lines il
       JOIN products p ON p.id = il.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE il.inventory_id = $1
      ORDER BY p.name`,
    [params.id],
  );

  return NextResponse.json({ inventory: inv.rows[0], lines: lines.rows });
}
