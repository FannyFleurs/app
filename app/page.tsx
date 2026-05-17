import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';

export default async function RootPage() {
  const user = await readSessionFromCookie();
  if (!user) redirect('/login');
  redirect('/dashboard');
}
