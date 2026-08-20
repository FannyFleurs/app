import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * État d'accueil d'une nouvelle caisse : quelles premières étapes sont faites.
 * `first_time` reste vrai tant qu'aucune vente n'a été encaissée — c'est le
 * signal pour afficher l'écran de bienvenue plutôt que d'ouvrir directement la
 * modale de fond de caisse.
 */
export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const org = g.user.organizationId;

  const r = await query<{ cats: string; prods: string; custs: string; sales: string }>(
    `SELECT
       (SELECT COUNT(*) FROM product_categories WHERE organization_id = $1)::text AS cats,
       (SELECT COUNT(*) FROM products          WHERE organization_id = $1)::text AS prods,
       (SELECT COUNT(*) FROM customers         WHERE organization_id = $1)::text AS custs,
       (SELECT COUNT(*) FROM sales             WHERE organization_id = $1 AND status = 'validated')::text AS sales`,
    [org],
  );
  const row = r.rows[0]!;
  const has_category = Number(row.cats) > 0;
  const has_product = Number(row.prods) > 0;
  const has_customer = Number(row.custs) > 0;
  const has_sale = Number(row.sales) > 0;

  return NextResponse.json({
    has_category,
    has_product,
    has_customer,
    has_sale,
    first_time: !has_sale,
  });
}
