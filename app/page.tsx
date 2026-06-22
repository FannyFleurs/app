import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';

export default async function RootPage() {
  const user = await readSessionFromCookie();
  if (!user) redirect('/login');
  // La caisse est la page d'arrivée par défaut pour les rôles caisse,
  // sinon le tableau de bord.
  if (hasPermission(user.role, 'pos.use')) redirect('/caisse');
  redirect('/dashboard');
}
