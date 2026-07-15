import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import CashSettingsForm from './CashSettingsForm';

export const dynamic = 'force-dynamic';

export default async function CashSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const canEdit = (await userCan(user, 'settings.write'));
  const stores = await accessibleStores(user);

  return <CashSettingsForm canEdit={canEdit} stores={stores} />;
}
