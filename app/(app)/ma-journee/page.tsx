import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import MaJourneeShell from './MaJourneeShell';

export const dynamic = 'force-dynamic';

export default async function MaJourneePage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
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
  return (
    <MaJourneeShell
      canClose={(await userCan(user, 'closures.daily'))}
      stores={stores.rows}
      registers={registers.rows}
    />
  );
}
