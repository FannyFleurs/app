import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import StockAdmin from './StockAdmin';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const user = (await readSessionFromCookie())!;

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores WHERE organization_id = $1 AND is_active ORDER BY name`,
    [user.organizationId],
  );

  return (
    <StockAdmin
      canAdjust={(await userCan(user, 'stock.adjust'))}
      stores={stores.rows}
    />
  );
}
