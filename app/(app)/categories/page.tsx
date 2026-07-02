import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import CategoriesAdmin from './CategoriesAdmin';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const user = (await readSessionFromCookie())!;
  return (
    <CategoriesAdmin canEdit={(await userCan(user, 'categories.write'))} />
  );
}
