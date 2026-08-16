import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadPlatform } from '@/lib/site/platform';
import { isSitePublic, isSiteHome, isLegalPath } from '@/lib/site/publication';
import HoldingScreen from './_components/HoldingScreen';
import MinimalHeader from './_components/MinimalHeader';
import { organizationLd, softwareLd, SITE_NAME, SITE_URL } from '@/lib/site/meta';
import Header from './_components/Header';
import Footer from './_components/Footer';
import SiteRuntime from './_components/SiteRuntime';
import './site.css';

/**
 * Habillage du site public hellopos.fr.
 *
 * L'application (caisse, back-office) interdit le zoom pour éviter les
 * gestes tactiles parasites au comptoir. Un site public, lui, doit rester
 * zoomable : on rétablit ici le comportement standard, conformément au
 * critère WCAG 1.4.4.
 *
 * C'est également ici que se joue la publication du site (Configuration →
 * Site public dans la console d'administration) : tant qu'il n'est pas
 * activé, la racine affiche l'écran d'attente et les autres pages y
 * ramènent. `force-dynamic` garantit que l'interrupteur prend effet à la
 * requête suivante, sans redéploiement.
 */

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#FBF9F2',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'HelloPos — La caisse qui fait beaucoup plus que la caisse',
    template: '%s',
  },
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  formatDetection: { telephone: false, email: false, address: false },
};

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // ---- Site non publié : rien du site n'est servi, sauf l'écran d'attente.
  if (!(await isSitePublic())) {
    // Le chemin d'origine est posé par le middleware avant la réécriture.
    const path = headers().get('x-hp-path') ?? '/';
    // Mentions légales et confidentialité restent accessibles : le
    // formulaire de contact de la page d'attente y renvoie, et une page qui
    // collecte des coordonnées doit dire ce qu'elle en fait.
    if (isLegalPath(path)) {
      return (
        <div className="hp">
          <div style={{ paddingTop: 'clamp(1.5rem, 4vh, 2.5rem)' }}>
            <MinimalHeader />
          </div>
          <main>{children}</main>
        </div>
      );
    }
    if (!isSiteHome(path)) redirect('/');
    return (
      <div className="hp hp-dark hp-on-green">
        <HoldingScreen />
      </div>
    );
  }

  const platform = await loadPlatform();
  const brand = platform.brand_name || SITE_NAME;

  const orgLd = organizationLd({
    brand,
    logoUrl: platform.logo_url || undefined,
    email: platform.contact_email || undefined,
    phone: platform.contact_phone || undefined,
    legalName: platform.company_legal_name || undefined,
    address: {
      street: platform.address_line1 || undefined,
      zip: platform.address_zip || undefined,
      city: platform.address_city || undefined,
      country: platform.address_country || 'FR',
    },
  });
  const appLd = softwareLd({ brand, priceFrom: platform.plan_essentiel_price || '29' });

  return (
    <div className="hp">
      <a className="hp-skip" href="#contenu">
        Aller au contenu
      </a>
      <SiteRuntime />
      <Header brand={brand} logoUrl={platform.logo_url || undefined} />
      <main id="contenu">{children}</main>
      <Footer platform={platform} brand={brand} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
    </div>
  );
}
