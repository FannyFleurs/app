import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import PinLogin from './PinLogin';

export default async function LoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/');
  return <PinLogin />;
}
