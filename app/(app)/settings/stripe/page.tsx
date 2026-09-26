import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import StripeSettingsForm from './StripeSettingsForm';

export const dynamic = 'force-dynamic';

/**
 * Stripe est désormais configurable PAR BOUTIQUE (une organisation
 * multi-boutiques peut avoir un compte Stripe différent par boutique) —
 * même sélecteur que /settings/email. `stores` vide (ex. organisation
 * mono-boutique sans boutique créée) laisse le formulaire au niveau
 * organisation, comportement historique inchangé.
 */
export default async function StripeSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = (await userCan(user, 'settings.write'));
  const stores = await accessibleStores(user);
  return <StripeSettingsForm canEdit={canEdit} stores={stores} />;
}
