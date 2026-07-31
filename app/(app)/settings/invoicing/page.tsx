import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import InvoicingSettingsForm from './InvoicingSettingsForm';

export const dynamic = 'force-dynamic';

export default async function InvoicingSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

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

  const canEdit = await userCan(user, 'settings.write');
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);

  return <InvoicingSettingsForm stores={stores.rows} canEdit={canEdit} lockedStoreId={lockedStoreId} />;
}
