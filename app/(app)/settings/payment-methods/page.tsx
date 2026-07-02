import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PaymentMethodsForm from './PaymentMethodsForm';

export const dynamic = 'force-dynamic';

export default async function PaymentMethodsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = (await userCan(user, 'settings.write'));
  return <PaymentMethodsForm canWrite={canEdit} />;
}
