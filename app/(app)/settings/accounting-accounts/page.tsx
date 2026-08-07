import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import AccountingAccountsAdmin from './AccountingAccountsAdmin';

export const dynamic = 'force-dynamic';

/**
 * Lecture ouverte au comptable : il doit pouvoir vérifier le paramétrage avant
 * d'exporter. L'écriture reste au propriétaire — un plan de comptes se décide.
 */
export default async function AccountingAccountsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <AccountingAccountsAdmin canEdit={await userCan(user, 'settings.write')} />;
}
