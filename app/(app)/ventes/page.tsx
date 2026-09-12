import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import VentesAdmin from './VentesAdmin';

export const dynamic = 'force-dynamic';

/**
 * Consultation des ventes (back-office) : la liste des ventes d'une journée,
 * filtrable par boutique, avec le détail d'un ticket en modale (articles,
 * remises, modes de règlement). C'est l'équivalent « à distance » de la liste
 * des ventes de « Ma journée » au comptoir. Même permission que la caisse
 * (`pos.use`), car on réutilise ses endpoints (/api/sales/today, /api/sales/:id).
 */
export default async function VentesPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return (
      <div className="p-8 text-sm text-ink-soft">
        Cette page est disponible depuis le back-office.
      </div>
    );
  }
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const stores = await accessibleStores(user);
  return <VentesAdmin stores={stores.map((s) => ({ id: s.id, name: s.name }))} />;
}
