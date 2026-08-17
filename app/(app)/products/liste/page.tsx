import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { userCan } from '@/lib/auth/permissions';
import ProductsGrid from '../ProductsGrid';

export const dynamic = 'force-dynamic';

/**
 * Vue liste éditable du catalogue (édition en série sans ouvrir chaque fiche).
 * Réservée au back-office, comme l'import : gestion catalogue multi-boutiques.
 */
export default async function ProductsGridPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'products.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const taxes = await query<{ id: string; code: string; rate: string; label: string; is_default: boolean }>(
    `SELECT id, code, rate, label, is_default FROM tax_rates
       WHERE organization_id = $1 AND is_active = TRUE
       ORDER BY rate DESC`,
    [user.organizationId],
  );
  let cats: { rows: { id: string; name: string }[] };
  const privileged = ['super_admin', 'owner'].includes(user.role);
  try {
    if (privileged) throw new Error('all');
    cats = await query<{ id: string; name: string }>(
      `SELECT c.id, c.name FROM product_categories c
        WHERE c.organization_id = $1 AND c.is_active = TRUE
          AND (
            NOT EXISTS (SELECT 1 FROM user_store_access WHERE user_id = $2)
            OR COALESCE(array_length(c.store_ids, 1), 0) = 0
            OR c.store_ids && (
              SELECT COALESCE(array_agg(store_id), '{}') FROM user_store_access WHERE user_id = $2
            )::uuid[]
          )
        ORDER BY c.position, c.name`,
      [user.organizationId, user.id],
    );
  } catch {
    cats = await query<{ id: string; name: string }>(
      `SELECT id, name FROM product_categories
         WHERE organization_id = $1 AND is_active = TRUE
         ORDER BY position, name`,
      [user.organizationId],
    );
  }

  return (
    <ProductsGrid
      canEdit={await userCan(user, 'products.write')}
      taxRates={taxes.rows.map((t) => ({ ...t, rate: Number(t.rate) }))}
      categories={cats.rows}
    />
  );
}
