import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';

export default async function RootPage() {
  const user = await readSessionFromCookie();
  if (!user) redirect('/login');
  // Super admin SaaS → console d'administration cross-tenant.
  if (user.role === 'super_admin') redirect('/admin');
  // Sinon la caisse pour les profils opérationnels…
  if (hasPermission(user.role, 'pos.use')) redirect('/caisse');
  // …ou le tableau de bord pour les autres.
  redirect('/dashboard');
}
