import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { hasPermission } from '@/lib/auth/rbac';
import ProductsList from './ProductsList';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'products.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const taxes = await query<{ id: string; code: string; rate: string; label: string; is_default: boolean }>(
    `SELECT id, code, rate, label, is_default FROM tax_rates
       WHERE organization_id = $1 AND is_active = TRUE
       ORDER BY rate DESC`,
    [user.organizationId],
  );
  const cats = await query<{ id: string; name: string }>(
    `SELECT id, name FROM product_categories
       WHERE organization_id = $1 AND is_active = TRUE
       ORDER BY position, name`,
    [user.organizationId],
  );
  return (
    <ProductsList
      canEdit={hasPermission(user.role, 'products.write')}
      taxRates={taxes.rows.map((t) => ({ ...t, rate: Number(t.rate) }))}
      categories={cats.rows}
    />
  );
}
