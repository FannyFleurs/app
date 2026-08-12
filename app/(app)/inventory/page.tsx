import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import InventoryList from './InventoryList';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
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

  // Poste de caisse appairé : la liste est celle de SA boutique, sans
  // sélecteur — on ne compte pas le stock d'à côté depuis le comptoir.
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);

  return <InventoryList stores={stores.rows} lockedStoreId={lockedStoreId} />;
}
