import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import SubscriptionView from './SubscriptionView';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'settings.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <SubscriptionView />;
}
