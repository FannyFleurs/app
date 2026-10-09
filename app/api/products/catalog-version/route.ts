import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Horodatage le plus récent parmi produits/variantes/catégories de
 * l'organisation — un simple « tampon » que la caisse interroge
 * périodiquement (poll léger) pour savoir si le catalogue a changé depuis
 * son dernier chargement, sans avoir à le retélécharger en entier à chaque
 * fois. Voir CashRegister.tsx (vérification automatique du catalogue).
 */
export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;

  const { rows } = await query<{ version: string | null }>(
    `SELECT GREATEST(
              (SELECT MAX(updated_at) FROM products WHERE organization_id = $1),
              (SELECT MAX(pv.updated_at) FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                WHERE p.organization_id = $1),
              (SELECT MAX(updated_at) FROM product_categories WHERE organization_id = $1)
            )::text AS version`,
    [g.user.organizationId],
  );

  return NextResponse.json({ version: rows[0]?.version ?? null });
}
