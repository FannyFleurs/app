import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = (await readSessionFromCookie())!;

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [user.organizationId],
  );

  const firstName = user.fullName.split(' ')[0] ?? user.fullName;

  return <DashboardClient firstName={firstName} stores={stores.rows} />;
}
