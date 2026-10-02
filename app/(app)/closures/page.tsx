import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';
import { computeClosurePreview } from '@/lib/services/closure-preview';
import ClosuresAdmin from './ClosuresAdmin';

export const dynamic = 'force-dynamic';

export default async function ClosuresPage({
  searchParams,
}: {
  searchParams?: { store_id?: string };
}) {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'closures.daily'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores WHERE organization_id = $1 AND is_active ORDER BY name`,
    [user.organizationId],
  );
  const registers = await query<{ id: string; store_id: string; code: string; name: string }>(
    `SELECT id, store_id, code, name FROM registers
      WHERE organization_id = $1 AND is_active ORDER BY name`,
    [user.organizationId],
  );

  // Boutique explicite (ex. poste itinérant — lien depuis « Ma journée », voir
  // MaJourneeClient.tsx) en priorité ; sinon celle du POSTE (caisse appairée) ;
  // sinon la 1re boutique. `resolveDeviceStoreId` ne connaît que la liaison
  // PERMANENTE d'un appareil (registers.device_id) — jamais le choix
  // itinérant, mémorisé seulement en localStorage côté client (voir
  // lib/caisse/roaming.ts) — d'où ce paramètre explicite en repli.
  const requestedStoreId = searchParams?.store_id;
  const requestedStoreValid = !!requestedStoreId && stores.rows.some((s) => s.id === requestedStoreId);
  const defaultStoreId = (requestedStoreValid ? requestedStoreId : null)
    ?? (await resolveDeviceStoreId(user.organizationId))
    ?? stores.rows[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);
  // Rendu SERVEUR de l'aperçu : la page arrive déjà remplie (pas de fetch
  // client à peindre après coup, qui restait bloqué sur certains desktop).
  const initialPreview = defaultStoreId ? await computeClosurePreview(defaultStoreId, today) : null;

  return (
    <ClosuresAdmin
      stores={stores.rows}
      registers={registers.rows}
      defaultStoreId={defaultStoreId}
      initialPreview={initialPreview}
      userName={user.fullName}
    />
  );
}
