import { readSessionFromCookie } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db/client';
import CADashboard from './CADashboard';

export const dynamic = 'force-dynamic';

export default async function CAPage() {
  const user = await readSessionFromCookie();
  if (!user) redirect('/ca/login');

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [user.organizationId],
  );

  const org = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1`,
    [user.organizationId],
  );

  return (
    <CADashboard
      stores={stores.rows}
      orgName={org.rows[0]?.name ?? 'Boutique'}
      user={{ fullName: user.fullName, email: user.email }}
    />
  );
}
