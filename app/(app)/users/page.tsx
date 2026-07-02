import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import UsersAdmin from './UsersAdmin';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'users.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return (
    <UsersAdmin
      canWrite={(await userCan(user, 'users.write'))}
      currentUserId={user.id}
    />
  );
}
