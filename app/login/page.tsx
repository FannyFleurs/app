import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import CaisseLogin from './CaisseLogin';

export default async function LoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/');
  return <CaisseLogin />;
}
