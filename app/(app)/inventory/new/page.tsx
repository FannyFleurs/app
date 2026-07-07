import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import InventoryNewForm from './InventoryNewForm';

export const dynamic = 'force-dynamic';

export default async function InventoryNewPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'stock.adjust'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [user.organizationId],
  );

  const categories = await query<{ id: string; name: string }>(
    `SELECT id, name FROM product_categories
      WHERE organization_id = $1
      ORDER BY name`,
    [user.organizationId],
  );

  // Fournisseurs = liste distincte des supplier_ref des produits actifs.
  const suppliers = await query<{ supplier_ref: string; product_count: number }>(
    `SELECT supplier_ref, COUNT(*)::int AS product_count
       FROM products
      WHERE organization_id = $1
        AND is_active = TRUE
        AND supplier_ref IS NOT NULL
        AND supplier_ref <> ''
      GROUP BY supplier_ref
      ORDER BY supplier_ref`,
    [user.organizationId],
  );

  return (
    <InventoryNewForm
      stores={stores.rows}
      categories={categories.rows}
      suppliers={suppliers.rows}
    />
  );
}
