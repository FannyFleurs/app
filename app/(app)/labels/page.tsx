import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import LabelsManager from './LabelsManager';

export const dynamic = 'force-dynamic';

export default async function LabelsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'products.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <LabelsManager />;
}
