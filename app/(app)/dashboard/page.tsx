import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = (await readSessionFromCookie())!;
  // Le tableau de bord expose chiffre d'affaires et marge. Il était atteignable
  // par URL sans aucun contrôle : masqué du menu pour un rôle restreint, il
  // restait ouvert à qui tapait l'adresse.
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [user.organizationId],
  );
  const lockedStoreId = await resolveSettingsLockStoreId(user.organizationId);

  const firstName = user.fullName.split(' ')[0] ?? user.fullName;

  return <DashboardClient firstName={firstName} stores={stores.rows} lockedStoreId={lockedStoreId} />;
}
