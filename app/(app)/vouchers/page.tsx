import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import VouchersAdmin from './VouchersAdmin';

export const dynamic = 'force-dynamic';

export default async function VouchersPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'pos.use')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <VouchersAdmin />;
}
