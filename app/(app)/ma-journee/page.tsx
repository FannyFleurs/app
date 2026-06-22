import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import MaJourneeClient from './MaJourneeClient';

export const dynamic = 'force-dynamic';

export default async function MaJourneePage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'pos.use')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <MaJourneeClient />;
}
