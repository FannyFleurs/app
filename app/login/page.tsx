import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { getServerBrand } from '@/lib/settings/brand-server';
import CaisseLogin from './CaisseLogin';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/');
  const brand = await getServerBrand();
  return <CaisseLogin logoUrl={brand.logoUrl} brandName={brand.brandName} />;
}
