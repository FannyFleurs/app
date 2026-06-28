import { readSessionFromCookie } from '@/lib/auth/session';
import OrdersClient from './OrdersClient';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const user = (await readSessionFromCookie())!;
  return <OrdersClient orgId={user.organizationId} />;
}
