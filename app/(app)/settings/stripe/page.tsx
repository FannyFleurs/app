import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import StripeSettingsForm from './StripeSettingsForm';

export const dynamic = 'force-dynamic';

export default async function StripeSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'settings.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = hasPermission(user.role, 'settings.write');
  return <StripeSettingsForm canEdit={canEdit} />;
}
