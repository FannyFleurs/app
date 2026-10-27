import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import ReceptionsList from './ReceptionsList';

export const dynamic = 'force-dynamic';

export default async function ReceptionsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'stock.adjust'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [user.organizationId],
  );

  return <ReceptionsList stores={stores.rows} canWrite={await userCan(user, 'products.write')} />;
}
