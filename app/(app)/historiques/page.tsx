import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import HistoryClient from './HistoryClient';

export const dynamic = 'force-dynamic';

export default async function HistoriquesPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'closures.daily'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const stores = await accessibleStores(user);
  // Poste de caisse appairé : le journal est celui de SA boutique, sans
  // sélecteur — on ne surveille pas la caisse d'à côté depuis le comptoir.
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);

  return <HistoryClient stores={stores} lockedStoreId={lockedStoreId} />;
}
