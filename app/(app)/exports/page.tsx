import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import ExportsAdmin from './ExportsAdmin';

export const dynamic = 'force-dynamic';

export default async function ExportsPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'fiscal.export')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <ExportsAdmin />;
}
