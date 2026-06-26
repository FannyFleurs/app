import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import PaymentMethodsForm from './PaymentMethodsForm';

export const dynamic = 'force-dynamic';

export default async function PaymentMethodsPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'pos.use')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = hasPermission(user.role, 'settings.write');
  return <PaymentMethodsForm canWrite={canEdit} />;
}
