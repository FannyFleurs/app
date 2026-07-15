import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import ReceiptSettingsForm from './ReceiptSettingsForm';

export const dynamic = 'force-dynamic';

export default async function ReceiptSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  // Boutiques visibles par l'utilisateur (même politique que /api/me) : les
  // rôles privilégiés voient toutes les boutiques, les autres uniquement
  // celles qui leur sont rattachées.
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

  const canEdit = (await userCan(user, 'settings.write'));

  return <ReceiptSettingsForm stores={stores.rows} canEdit={canEdit} />;
}
