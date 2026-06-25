import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT p.id AS product_id, p.name AS product_name, p.sku AS product_sku,
            p.unit, p.min_stock::text, p.max_stock::text,
            st.id AS store_id, st.name AS store_name,
            sl.quantity::text
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
       JOIN stores st ON st.id = sl.store_id
      WHERE p.organization_id = $1
      ORDER BY p.name, st.name`,
    [g.user.organizationId],
  );
  return NextResponse.json({ levels: rows });
}
