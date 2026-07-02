import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import SubscriptionView from './SubscriptionView';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <SubscriptionView />;
}
