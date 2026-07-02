import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import ExportsAdmin from './ExportsAdmin';

export const dynamic = 'force-dynamic';

export default async function ExportsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'fiscal.export'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <ExportsAdmin />;
}
