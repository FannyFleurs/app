import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Boutiques et familles de produit, pour le paramétrage des comptes de ventes.
 *
 * Les listes existent déjà (/api/stores, /api/categories) mais derrière
 * `settings.read` et `products.read` — deux permissions que le comptable
 * externe n'a volontairement pas. Résultat : ses listes déroulantes
 * « Boutique » et « Famille » restaient vides, et il ne pouvait pas faire la
 * seule chose qu'on lui demande, rattacher un compte à une boutique.
 *
 * Plutôt qu'élargir ces permissions — ce qui lui rouvrirait le catalogue et
 * les réglages —, on expose ici le strict nécessaire : un identifiant et un
 * nom, en lecture, sous la permission comptable.
 */

interface Ref { id: string; name: string }

export async function GET() {
  const g = await requirePermission('accounting.read');
  if ('response' in g) return g.response;

  // Boutiques et familles inactives comprises : une règle déjà écrite peut en
  // viser une, et l'absente du menu déroulant se transformerait en « Toutes »
  // au premier enregistrement — la règle changerait de portée sans un mot.
  const [stores, categories] = await Promise.all([
    query<Ref>(
      `SELECT id, name FROM stores
        WHERE organization_id = $1
        ORDER BY name`,
      [g.user.organizationId],
    ),
    query<Ref>(
      `SELECT id, name FROM product_categories
        WHERE organization_id = $1
        ORDER BY name`,
      [g.user.organizationId],
    ),
  ]);

  return NextResponse.json({ stores: stores.rows, categories: categories.rows });
}
