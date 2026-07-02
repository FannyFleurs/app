import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import VouchersAdmin from './VouchersAdmin';

export const dynamic = 'force-dynamic';

export default async function VouchersPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <VouchersAdmin />;
}
