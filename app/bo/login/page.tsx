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
  // Même raison côté écran atelier : ajouté à l'écran d'accueil depuis la page
  // de connexion, il doit démarrer sur /ecran.
  if (host.startsWith('ecran.')) {
    return {
      title: 'Écran atelier',
      manifest: '/manifest-ecran.json',
      icons: { apple: [{ url: '/api/brand/icon' }] },
      appleWebApp: { capable: true, title: 'Écran atelier' },
    };
  }
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
export default async function BackOfficeLoginPage({ searchParams }: {
  searchParams?: { from?: string };
}) {
  const user = await readSessionFromCookie();
  if (user) redirect('/');
  const brand = await getServerBrand();
  const host = (headers().get('host') ?? '').toLowerCase();
  const isAdmin = host.startsWith('admin.');
  // L'écran atelier partage ce formulaire — même connexion par email — mais
  // pas son intitulé : annoncer « Back-office » à qui allume une tablette
  // murale, c'est lui faire croire qu'il s'est trompé d'adresse. En
  // préversion il n'y a pas de sous-domaine : /ecran passe donc `?from=ecran`.
  const isEcran = host.startsWith('ecran.') || searchParams?.from === 'ecran';

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

  if (isEcran) {
    return (
      <AuthForm
        logoUrl={brand.logoUrl}
        brandName={brand.brandName}
        title={`Écran ${brand.brandName}`}
        subtitle="Connectez-vous avec l'email de votre organisation pour afficher les commandes à préparer."
        submitLabel="Ouvrir l'écran"
        redirectTo="/ecran"
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
