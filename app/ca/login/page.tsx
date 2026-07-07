import { readSessionFromCookie } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import CALoginForm from './CALoginForm';

export const dynamic = 'force-dynamic';

export default async function CALoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/');
  return <CALoginForm />;
}
