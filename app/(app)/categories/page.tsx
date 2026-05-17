import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import CategoriesAdmin from './CategoriesAdmin';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const user = (await readSessionFromCookie())!;
  return (
    <CategoriesAdmin canEdit={hasPermission(user.role, 'categories.write')} />
  );
}
