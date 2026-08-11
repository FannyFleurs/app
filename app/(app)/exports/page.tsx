import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import ExportsAdmin from './ExportsAdmin';
import SalesAccountsSection from './SalesAccountsSection';

export const dynamic = 'force-dynamic';

export default async function ExportsPage() {
  // Garde explicite plutôt que l'assertion non nulle : sans session, la page
  // levait une exception au lieu de refuser proprement.
  const user = await readSessionFromCookie();
  if (!user) return <div className="p-8">Accès refusé.</div>;
  if (!(await userCan(user, 'fiscal.export'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  // Le plan de comptes vit sur cette page et non dans les réglages : c'est le
  // comptable qui le renseigne, et il n'a accès qu'ici.
  const [canRead, canEdit] = await Promise.all([
    userCan(user, 'accounting.read'),
    userCan(user, 'accounting.write'),
  ]);

  return (
    // Pleine largeur : les tableaux de comptes ont sept colonnes, les brider à
    // une colonne de lecture les faisait défiler latéralement alors que
    // l'écran, lui, était à moitié vide.
    <div className="p-6 md:p-8 space-y-8 w-full">
      <ExportsAdmin />
      {canRead && <SalesAccountsSection canEdit={canEdit} />}
    </div>
  );
}
