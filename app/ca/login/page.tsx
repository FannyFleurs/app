import { readSessionFromCookie } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getServerBrand } from '@/lib/settings/brand-server';

export const dynamic = 'force-dynamic';

export default async function CALoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/ca');
  const brand = await getServerBrand();

  return (
    <AuthForm
      logoUrl={brand.caLogoUrl}
      brandName={brand.brandName}
      title="Chiffre d'affaires"
      subtitle="Connectez-vous avec votre email et votre mot de passe."
      submitLabel="Se connecter"
      redirectTo="/ca"
    />
  );
}
