import Link from 'next/link';
import type { PlatformSettings } from '@/lib/settings/platform';
import { TRADES } from '@/lib/site/content/trades';
import Logo from './Logo';
import LegalLine from './LegalLine';

/**
 * Pied de page : plan du site, accès à l'application, mentions de l'éditeur.
 *
 * Les informations légales viennent des réglages de la plateforme : celles
 * qui ne sont pas renseignées ne sont pas affichées — jamais de valeur
 * inventée pour « remplir » la ligne.
 */
export default function Footer({ platform, brand }: { platform: PlatformSettings; brand: string }) {
  return (
    <footer className="hp-footer hp-on-green-deep hp-dark">
      <div className="hp-container" style={{ paddingBlock: 'clamp(3rem, 2rem + 4vw, 5rem)' }}>
        <div className="hp-footer-cols">
          <div>
            <Logo brand={brand} logoUrl={platform.logo_url || undefined} onDark />
            <p className="hp-small" style={{ marginTop: '1rem', maxWidth: '26ch' }}>
              Le logiciel de caisse et de gestion qui simplifie le quotidien des commerçants.
            </p>
          </div>

          <div>
            <h2>Produit</h2>
            <ul>
              <li><Link href="/fonctionnalites">Fonctionnalités</Link></li>
              <li><Link href="/tarifs">Tarifs</Link></li>
              <li><Link href="/materiel">Matériel</Link></li>
              <li><Link href="/conformite">Conformité</Link></li>
            </ul>
          </div>

          <div>
            <h2>Solutions</h2>
            <ul>
              {TRADES.map((t) => (
                <li key={t.slug}>
                  <Link href={`/solutions/${t.slug}`}>{t.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2>Ressources</h2>
            <ul>
              <li><Link href="/ressources#questions">Questions fréquentes</Link></li>
              <li><Link href="/ressources#guides">Guides</Link></li>
              <li><Link href="/ressources#actualites">Actualités</Link></li>
              <li><Link href="/clients">Cas clients</Link></li>
            </ul>
          </div>

          <div>
            <h2>Entreprise</h2>
            <ul>
              <li><Link href="/a-propos">À propos</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/connexion">Connexion</Link></li>
              <li><Link href="/mentions-legales">Mentions légales</Link></li>
              <li><Link href="/confidentialite">Confidentialité</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--on-green-line)' }}>
        <div
          className="hp-container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ paddingBlock: '1.25rem' }}
        >
          <LegalLine platform={platform} brand={brand} />
          <p className="hp-fine">
            {platform.contact_email ? (
              <a href={`mailto:${platform.contact_email}`}>{platform.contact_email}</a>
            ) : null}
            {platform.contact_email && platform.contact_phone ? <span aria-hidden="true"> · </span> : null}
            {platform.contact_phone ? <a href={`tel:${platform.contact_phone.replace(/\s/g, '')}`}>{platform.contact_phone}</a> : null}
          </p>
        </div>
      </div>
    </footer>
  );
}
