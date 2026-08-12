import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { storeInOrg } from '@/lib/auth/stores-server';
import { produitDansBoutique } from '@/lib/services/inventory-scope';

export const dynamic = 'force-dynamic';

/**
 * Portées possibles d'un inventaire, pour UNE boutique.
 *
 * On comptait jusqu'ici avec la liste des catégories de l'organisation : à
 * Mortagne, on se voyait proposer les catégories d'Alençon, et les cocher ne
 * produisait que des lignes à zéro. La question posée est « qu'y a-t-il ICI
 * à compter ».
 */

export async function GET(req: Request) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;

  const storeId = new URL(req.url).searchParams.get('store_id');
  if (!storeId || !(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
  }

  const [cats, sups] = await Promise.all([
    query<{ id: string; name: string; product_count: number }>(
      `SELECT c.id, c.name, COUNT(p.id)::int AS product_count
         FROM product_categories c
         JOIN products p ON p.category_id = c.id
          AND p.organization_id = $1 AND p.is_active = TRUE
        WHERE c.organization_id = $1
          AND ${produitDansBoutique('$2')}
        GROUP BY c.id, c.name
        ORDER BY c.name`,
      [g.user.organizationId, storeId],
    ),
    query<{ supplier_ref: string; product_count: number }>(
      `SELECT p.supplier_ref, COUNT(*)::int AS product_count
         FROM products p
        WHERE p.organization_id = $1
          AND p.is_active = TRUE
          AND p.supplier_ref IS NOT NULL AND p.supplier_ref <> ''
          AND ${produitDansBoutique('$2')}
        GROUP BY p.supplier_ref
        ORDER BY p.supplier_ref`,
      [g.user.organizationId, storeId],
    ),
  ]);

  return NextResponse.json({ categories: cats.rows, suppliers: sups.rows });
}
