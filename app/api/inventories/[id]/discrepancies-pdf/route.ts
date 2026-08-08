import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { renderInventoryPdf, type InventoryPdfLine } from '@/lib/services/inventory-pdf';

export const dynamic = 'force-dynamic';

/**
 * Liste des écarts d'un inventaire, en PDF.
 *
 * `?all=1` renvoie toutes les lignes plutôt que les seuls écarts — utile pour
 * relire un comptage complet. Par défaut on ne sort que ce qui diffère : c'est
 * la liste qu'on emporte dans les rayons.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  const inv = await query<{
    label: string; store_name: string; created_at: string; status: string;
  }>(
    `SELECT i.label, COALESCE(s.name, '') AS store_name,
            i.created_at::text, i.status
       FROM inventories i
       LEFT JOIN stores s ON s.id = i.store_id
      WHERE i.id = $1 AND i.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (inv.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const tout = new URL(req.url).searchParams.get('all') === '1';
  // Le tri suit la famille puis le nom : c'est l'ordre dans lequel on parcourt
  // le magasin, pas celui d'une base de données.
  const lines = await query<InventoryPdfLine>(
    `SELECT p.name AS product_name, c.name AS category_name,
            p.sku, p.barcode,
            il.expected_qty::text, il.counted_qty::text,
            il.purchase_price_ht::text
       FROM inventory_lines il
       JOIN products p ON p.id = il.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE il.inventory_id = $1
        ${tout ? '' : 'AND il.counted_qty IS DISTINCT FROM il.expected_qty'}
      ORDER BY c.name NULLS LAST, p.name`,
    [params.id],
  );

  const pdf = await renderInventoryPdf(inv.rows[0]!, lines.rows);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        `inline; filename="ecarts-inventaire-${params.id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
