import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import UsersAdmin from './UsersAdmin';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'users.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return (
    <UsersAdmin
      canWrite={hasPermission(user.role, 'users.write')}
      currentUserId={user.id}
    />
  );
}
