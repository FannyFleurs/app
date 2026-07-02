import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import CreditNotesList from './CreditNotesList';

export const dynamic = 'force-dynamic';

export default async function CreditNotesPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <CreditNotesList />;
}
