import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import RemisesClient from './RemisesClient';

export const dynamic = 'force-dynamic';

/**
 * Remises (back-office) : tableau de bord des remises accordées (montant, taux,
 * classement par motif) et liste des ventes remisées, détail en modale.
 * Réservée au back-office et à `settings.read`, comme les autres pages Pilotage.
 */
export default async function RemisesPage() {
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
  return <RemisesClient stores={stores.map((s) => ({ id: s.id, name: s.name }))} />;
}
