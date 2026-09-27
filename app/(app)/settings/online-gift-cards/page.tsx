import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import OnlineGiftCardsSettingsForm from './OnlineGiftCardsSettingsForm';

export const dynamic = 'force-dynamic';

/**
 * Cartes cadeaux en ligne : configuration PAR BOUTIQUE (une organisation
 * multi-boutiques peut vendre pour plusieurs sites, chacun avec sa propre
 * clé publique/domaines/montants) — même sélecteur que /settings/email et
 * la section Stripe de /settings/payment-methods.
 */
export default async function OnlineGiftCardsSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = await userCan(user, 'settings.write');
  const stores = await accessibleStores(user);
  return <OnlineGiftCardsSettingsForm canEdit={canEdit} stores={stores} />;
}
