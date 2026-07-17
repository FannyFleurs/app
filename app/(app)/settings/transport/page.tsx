import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import TransportForm from './TransportForm';

export const dynamic = 'force-dynamic';

export default async function TransportSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'products.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = await userCan(user, 'settings.write');
  return <TransportForm canEdit={canEdit} />;
}
