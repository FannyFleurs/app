import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import SuppliersAdmin from './SuppliersAdmin';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const user = (await readSessionFromCookie())!;
  return <SuppliersAdmin canEdit={await userCan(user, 'products.write')} />;
}
