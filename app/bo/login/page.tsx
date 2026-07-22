import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import AuthForm from '@/components/AuthForm';
import { getServerBrand } from '@/lib/settings/brand-server';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

// La page de connexion admin (admin./login) doit utiliser le manifest admin
// (start_url /) — sinon l'ajout à l'écran d'accueil ouvre /caisse → 404.
export async function generateMetadata(): Promise<Metadata> {
  const host = (headers().get('host') ?? '').toLowerCase();
  if (host.startsWith('admin.')) {
    return {
      manifest: '/manifest-admin.json',
      icons: { apple: [{ url: '/api/brand/icon?scope=admin' }] },
      appleWebApp: { capable: true, title: 'Admin' },
    };
  }
  return {};
}

/**
 * Écran de connexion email + mot de passe (back-office ET console admin).
 * La même page sert les deux ; on adapte titre + logo selon le sous-domaine :
 *   - admin.  → Console admin (logo admin)
 *   - bo. / autre → Back-office (logo BO)
 */
export default async function BackOfficeLoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/');
  const brand = await getServerBrand();
  const host = (headers().get('host') ?? '').toLowerCase();
  const isAdmin = host.startsWith('admin.');

  if (isAdmin) {
    return (
      <AuthForm
        logoUrl={brand.adminLogoUrl}
        brandName={brand.brandName}
        title="Console admin"
        subtitle="Connectez-vous à la console d'administration (opérateur HelloPos)."
        submitLabel="Entrer dans l'admin"
        redirectTo="/"
      />
    );
  }

  return (
    <AuthForm
      logoUrl={brand.boLogoUrl}
      brandName={brand.brandName}
      title="Back-office"
      subtitle="Connectez-vous avec votre email et votre mot de passe administrateur."
      submitLabel="Entrer dans le back-office"
      redirectTo="/"
      footer={<>Retour à la <a href="/login" className="underline hover:text-ink">caisse</a></>}
    />
  );
}
