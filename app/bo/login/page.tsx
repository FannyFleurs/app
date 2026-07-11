import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import AuthForm from '@/components/AuthForm';
import { getServerBrand } from '@/lib/settings/brand-server';

export const dynamic = 'force-dynamic';

/**
 * Ecran de connexion du back-office (sous-domaine bo. ou path /bo).
 * Email + mot de passe (identifiants admin), pas le PIN — le back-office
 * est accessible depuis n'importe où et n'est pas lié à un poste physique.
 * Rendu identique aux autres pages de connexion (composant AuthForm).
 */
export default async function BackOfficeLoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/');
  const brand = await getServerBrand();

  return (
    <AuthForm
      logoUrl={brand.logoUrl}
      brandName={brand.brandName}
      title="Back-office"
      subtitle="Connectez-vous avec votre email et votre mot de passe administrateur."
      submitLabel="Entrer dans le back-office"
      redirectTo="/"
      footer={<>Retour à la <a href="/login" className="underline hover:text-ink">caisse</a></>}
    />
  );
}
