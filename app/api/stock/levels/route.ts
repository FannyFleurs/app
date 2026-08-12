import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export async function GET(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id') || undefined;
  const productId = url.searchParams.get('product_id') || undefined;

  const params: unknown[] = [g.user.organizationId];
  // Un article archivé n'est plus en vente : le laisser dans la valorisation du
  // stock ferait compter deux fois ce qu'on a justement décidé de sortir.
  let where = `p.organization_id = $1 AND p.is_active = TRUE`;
  if (storeId) { params.push(storeId); where += ` AND sl.store_id = $${params.length}`; }
  if (productId) { params.push(productId); where += ` AND sl.product_id = $${params.length}`; }

  const { rows } = await query(
    `SELECT p.id AS product_id, p.name AS product_name, p.sku AS product_sku,
            p.unit, p.min_stock::text, p.max_stock::text,
            p.purchase_price_ht::text, p.sale_price_ttc::text,
            p.category_id, c.name AS category_name,
            st.id AS store_id, st.name AS store_name,
            sl.quantity::text
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
       JOIN stores st ON st.id = sl.store_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE ${where}
      ORDER BY p.name, st.name`,
    params,
  );
  return NextResponse.json({ levels: rows });
}
