import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import GiftCardsAdmin from './GiftCardsAdmin';

export const dynamic = 'force-dynamic';

export default async function GiftCardsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <GiftCardsAdmin />;
}
