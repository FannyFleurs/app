import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

/**
 * Liste des articles achetés par un client (agrégat sur toutes ses ventes
 * validées). Pratique pour repérer ses produits favoris.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const { rows } = await query<{
    product_id: string | null;
    label: string;
    total_quantity: string;
    total_ttc: string;
    receipt_count: string;
    last_purchase_at: string;
  }>(
    `SELECT sl.product_id,
            MIN(sl.label) AS label,
            SUM(sl.quantity)::text AS total_quantity,
            SUM(sl.line_ttc)::text AS total_ttc,
            COUNT(DISTINCT s.id)::text AS receipt_count,
            MAX(s.validated_at) AS last_purchase_at
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.organization_id = $1
        AND s.customer_id = $2
        AND s.status = 'validated'
      GROUP BY sl.product_id, sl.label
      ORDER BY last_purchase_at DESC NULLS LAST, total_ttc DESC
      LIMIT 200`,
    [g.user.organizationId, params.id],
  );
  return NextResponse.json({ purchases: rows });
}
