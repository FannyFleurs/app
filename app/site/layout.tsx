import Link from 'next/link';
import { loadPlatform } from '@/lib/site/platform';
import SiteInteractions from './SiteInteractions';
import MobileMenu from './MobileMenu';
import './interactions.css';

/**
 * Habillage commun du site vitrine hellopos.fr : en-tête collant et pied de
 * page, aux couleurs de la marque (vert profond #013E37, or #FFEFB3, ivoire
 * #F8F6F0). Chaque page marketing s'inscrit à l'intérieur.
 *
 * Le lien « Créer une boutique » a été retiré du menu : l'entrée dans le
 * produit se fait par une démonstration (contact), pas en libre-service.
 */

const NAV = [
  { href: '/fonctionnalites', label: 'Fonctionnalités' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/avis', label: 'Avis' },
  { href: '/conformite', label: 'Conformité' },
  { href: '/contact', label: 'Contact' },
];

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const year = new Date().getFullYear();

  return (
    <div className="site-root min-h-screen flex flex-col" style={{ backgroundColor: '#F8F6F0', color: '#14211D' }}>
      <SiteInteractions />
      {/* En-tête */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur"
        style={{ borderColor: '#E7E3D8', backgroundColor: 'rgba(248,246,240,0.85)' }}
      >
        <div className="site-header-inner max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-6">
          <Link href="/" className="site-logo flex items-center gap-2.5 shrink-0">
            {platform.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={platform.logo_url} alt={brand} className="h-9 w-auto max-w-[170px] object-contain" />
            ) : (
              <>
                <span
                  className="grid h-9 w-9 place-items-center rounded-xl font-semibold text-white"
                  style={{ backgroundColor: '#013E37' }}
                >
                  {brand.charAt(0)}
                </span>
                <span className="font-semibold tracking-tight text-lg">{brand}</span>
              </>
            )}
          </Link>

          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-ink-soft hover:text-ink transition-colors">
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="/login"
              className="site-btn hidden sm:inline-flex items-center h-10 px-4 rounded-xl text-sm font-medium hover:bg-black/5"
              style={{ color: '#013E37' }}
            >
              Se connecter
            </a>
            <Link
              href="/contact"
              className="site-btn hidden sm:inline-flex items-center h-10 px-4 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#013E37' }}
            >
              Demander une démo
            </Link>
            <MobileMenu nav={NAV} />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Pied de page */}
      <footer style={{ backgroundColor: '#013E37', color: '#EAE6DC' }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14 grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              {platform.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={platform.logo_url} alt={brand} className="h-8 w-auto max-w-[150px] object-contain" />
              ) : (
                <span className="text-xl font-semibold tracking-tight" style={{ color: '#FFEFB3' }}>{brand}</span>
              )}
            </div>
            <p className="mt-3 text-sm max-w-sm" style={{ color: 'rgba(234,230,220,0.75)' }}>
              La caisse pensée pour votre boutique. Du comptoir au back-office,
              une seule application, conforme à la réglementation française.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#FFEFB3' }}>
              Produit
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="hover:text-white transition-colors" style={{ color: 'rgba(234,230,220,0.85)' }}>
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#FFEFB3' }}>
              Accès
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/login" className="hover:text-white transition-colors" style={{ color: 'rgba(234,230,220,0.85)' }}>Caisse</a></li>
              <li><a href="/bo" className="hover:text-white transition-colors" style={{ color: 'rgba(234,230,220,0.85)' }}>Back-office</a></li>
              {platform.contact_email && (
                <li><a href={`mailto:${platform.contact_email}`} className="hover:text-white transition-colors" style={{ color: 'rgba(234,230,220,0.85)' }}>Nous écrire</a></li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs" style={{ color: 'rgba(234,230,220,0.6)' }}>
            <div>© {year} {brand}{platform.company_legal_name && ` — ${platform.company_legal_name}`}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {platform.company_siret && <span>SIRET {platform.company_siret}</span>}
              {platform.company_vat && <span>TVA {platform.company_vat}</span>}
              {platform.contact_phone && <span>{platform.contact_phone}</span>}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
