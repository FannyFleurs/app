import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { userCan } from '@/lib/auth/permissions';
import ProductsList from './ProductsList';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'products.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  // Back-office (sous-domaine bo.) : gestion multi-boutiques. En dehors du BO,
  // chaque boutique ne voit / ne crée que ses propres articles.
  const backOffice = headers().get('x-webpos-bo') === '1';
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
      canEdit={(await userCan(user, 'products.write'))}
      taxRates={taxes.rows.map((t) => ({ ...t, rate: Number(t.rate) }))}
      categories={cats.rows}
      backOffice={backOffice}
    />
  );
}
