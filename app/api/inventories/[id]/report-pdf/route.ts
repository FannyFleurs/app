import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { renderInventoryReportPdf, type InventoryPdfLine } from '@/lib/services/inventory-pdf';

export const dynamic = 'force-dynamic';

/**
 * Rapport d'inventaire complet, en PDF.
 *
 * À la différence de `discrepancies-pdf` (les seuls écarts, pour corriger dans
 * les rayons), ce rapport reprend TOUTES les lignes comptées, regroupées par
 * famille, avec la valeur du stock final par catégorie et le total. C'est la
 * pièce qu'on archive dans le dossier d'inventaire.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
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

  // Toutes les lignes comptées, triées par famille puis par nom : c'est
  // l'ordre du rapport, qui regroupe le stock par catégorie.
  const lines = await query<InventoryPdfLine>(
    `SELECT p.name AS product_name, c.name AS category_name,
            p.sku, p.barcode,
            il.expected_qty::text, il.counted_qty::text,
            il.purchase_price_ht::text
       FROM inventory_lines il
       JOIN products p ON p.id = il.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE il.inventory_id = $1
      ORDER BY c.name NULLS LAST, p.name`,
    [params.id],
  );

  const pdf = await renderInventoryReportPdf(inv.rows[0]!, lines.rows);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        `inline; filename="rapport-inventaire-${params.id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
