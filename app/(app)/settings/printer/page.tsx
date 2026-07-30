import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import PrinterSettingsForm from './PrinterSettingsForm';

export const dynamic = 'force-dynamic';

export default async function PrinterSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = (await userCan(user, 'settings.write'));
  const stores = await accessibleStores(user);
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);
  return <PrinterSettingsForm canWrite={canWrite} stores={stores} lockedStoreId={lockedStoreId} />;
}
