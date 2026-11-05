import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import PaymentMethodsForm from './PaymentMethodsForm';

export const dynamic = 'force-dynamic';

export default async function PaymentMethodsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = (await userCan(user, 'settings.write'));
  const stores = await accessibleStores(user);
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);
  return <PaymentMethodsForm canWrite={canEdit} stores={stores} lockedStoreId={lockedStoreId} />;
}
