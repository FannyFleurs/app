import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import TvaSettingsForm from './TvaSettingsForm';

export const dynamic = 'force-dynamic';

/**
 * Réglages TVA — back-office uniquement. Les taux sont partagés (organisation) ;
 * chaque boutique choisit son taux par DÉFAUT.
 */
export default async function TvaSettingsPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Ce réglage est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');

  const stores = await query<{ id: string; name: string }>(
    `SELECT s.id, s.name FROM stores s
      WHERE s.organization_id = $2
        AND s.is_active = TRUE
        AND (
          $3 IN ('super_admin','owner','manager')
          OR NOT EXISTS (SELECT 1 FROM user_store_access WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM user_store_access
                      WHERE user_id = $1 AND store_id = s.id)
        )
      ORDER BY s.name`,
    [user.id, user.organizationId, user.role],
  );

  return <TvaSettingsForm canWrite={canWrite} stores={stores.rows} />;
}
