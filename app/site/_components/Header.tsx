import Link from 'next/link';
import Logo from './Logo';
import MobileNav, { type NavItem } from './MobileNav';

/**
 * En-tête collant : logo, navigation, connexion, essai.
 *
 * Volontairement minimal — six entrées, une action. L'état « défilé » (filet
 * de séparation) est posé par SiteRuntime, pas par du JavaScript embarqué
 * ici : l'en-tête reste un composant serveur.
 */

export const NAV: NavItem[] = [
  { href: '/fonctionnalites', label: 'Fonctionnalités', hint: 'Tout ce que fait HelloPos' },
  { href: '/tarifs', label: 'Tarifs', hint: 'Dès 29 € HT/mois' },
  { href: '/materiel', label: 'Matériel', hint: 'Tablette, imprimante, scan' },
  { href: '/solutions', label: 'Solutions', hint: 'Par métier' },
  { href: '/ressources', label: 'Ressources', hint: 'Guides et conseils' },
  { href: '/a-propos', label: 'À propos', hint: 'Pourquoi HelloPos existe' },
];

export default function Header({ brand, logoUrl }: { brand: string; logoUrl?: string }) {
  return (
    <header className="hp-header" data-scrolled="false">
      <div className="hp-container hp-header-inner">
        <Logo brand={brand} logoUrl={logoUrl} />

        <nav className="hp-nav" aria-label="Navigation principale">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hp-header-actions">
          <Link href="/connexion" className="hp-btn hp-btn--ghost hp-btn--sm hp-login-link">
            Connexion
          </Link>
          <a href="/setup" className="hp-btn hp-btn--primary hp-btn--sm" data-track="essai_hellopos" data-track-props='{"emplacement":"en-tete"}'>
            Créer ma caisse
          </a>
          <MobileNav nav={NAV} brand={brand} />
        </div>
      </div>
    </header>
  );
}
