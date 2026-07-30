import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';
import { computeClosurePreview } from '@/lib/services/closure-preview';
import ClosuresAdmin from './ClosuresAdmin';

export const dynamic = 'force-dynamic';

export default async function ClosuresPage() {
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

  // Clôture de la boutique du POSTE (caisse appairée), sinon 1re boutique.
  const defaultStoreId = (await resolveDeviceStoreId(user.organizationId)) ?? stores.rows[0]?.id ?? '';
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
    />
  );
}
