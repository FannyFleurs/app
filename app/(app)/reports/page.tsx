import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import ReportsClient from './ReportsClient';

export const dynamic = 'force-dynamic';

/**
 * Rapports (back-office) : lecture consolidée de l'activité sur une période.
 *
 * Réservée au back-office — c'est là qu'on analyse, pas au comptoir — et à la
 * permission `settings.read`, qui couvre déjà les rôles autorisés à consulter
 * les chiffres consolidés (propriétaire, manager, comptable).
 */
export default async function ReportsPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return (
      <div className="p-8 text-sm text-ink-soft">
        Cette page est disponible depuis le back-office.
      </div>
    );
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const stores = await accessibleStores(user);
  return <ReportsClient stores={stores.map((s) => ({ id: s.id, name: s.name }))} />;
}
