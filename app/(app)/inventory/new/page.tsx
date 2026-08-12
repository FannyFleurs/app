import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
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

  // Catégories et fournisseurs ne sont plus chargés ici : ils dépendent de la
  // boutique choisie dans le formulaire, et changent avec elle.
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);

  return (
    <InventoryNewForm
      stores={stores.rows}
      lockedStoreId={lockedStoreId}
    />
  );
}
