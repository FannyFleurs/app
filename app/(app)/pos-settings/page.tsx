import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  POS_UI_DEFAULTS,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import { loadTileSizeOverride } from '@/lib/settings/tile-size-server';
import { loadAutoLogoutOverride } from '@/lib/settings/auto-logout-server';
import PageHeader from '@/components/PageHeader';
import POSSettingsForm from './POSSettingsForm';
import PosteRefCard from '@/components/PosteRefCard';

export const dynamic = 'force-dynamic';

export default async function POSSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = (await userCan(user, 'pos.settings.write'));

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const initial = mergeWithDefaults(rows[0]?.value ?? null);

  // Taille des tuiles : réglage PAR BOUTIQUE (voir tile-size-server.ts) —
  // distinct du reste de cette page, qui reste au niveau organisation. Sur un
  // poste de caisse appairé, verrouillé sur SA boutique (comme l'imprimante) ;
  // en back-office, un sélecteur reste pour configurer chaque boutique.
  const stores = await accessibleStores(user);
  const lockStoreId = await resolveSettingsLockStoreId(user.organizationId);
  const initialTileSize = (await loadTileSizeOverride(user.organizationId, lockStoreId))
    ?? initial.tile_size ?? POS_UI_DEFAULTS.tile_size;

  // Déconnexion automatique : réglage PAR BOUTIQUE (voir auto-logout-server.ts)
  // — même motif que la taille des tuiles ci-dessus.
  const autoLogoutOverride = await loadAutoLogoutOverride(user.organizationId, lockStoreId);
  const initialAutoLogoutMode = autoLogoutOverride?.auto_logout_mode
    ?? initial.auto_logout_mode ?? POS_UI_DEFAULTS.auto_logout_mode;
  const initialAutoLogoutMinutes = autoLogoutOverride?.auto_logout_minutes
    ?? initial.auto_logout_minutes ?? POS_UI_DEFAULTS.auto_logout_minutes;

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Paramètres caisse"
        subtitle="Personnalisez l'interface de vente. Vos réglages sont enregistrés au niveau de votre organisation et appliqués sur toutes les caisses, à l'exception de la taille des tuiles et de la déconnexion automatique (réglables par boutique)."
        badge={!canWrite ? { label: 'Lecture seule pour votre rôle', tone: 'soft' } : undefined}
      />
      <PosteRefCard />
      <POSSettingsForm
        initial={initial}
        canWrite={canWrite}
        stores={stores}
        lockStoreId={lockStoreId}
        initialTileSize={initialTileSize}
        initialAutoLogoutMode={initialAutoLogoutMode}
        initialAutoLogoutMinutes={initialAutoLogoutMinutes}
      />
    </div>
  );
}
