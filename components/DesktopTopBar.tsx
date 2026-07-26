'use client';

import Link from 'next/link';
import { useBrand } from './BrandMark';

/**
 * Barre supérieure blanche (desktop / tablette) qui ne contient QUE le logo.
 *
 * Auparavant le logo vivait tout en haut du rail gauche et débordait
 * volontairement vers la droite (overflow-visible) : il passait alors sous /
 * par-dessus les titres de page (« Paramètres », en-tête de section…) et se
 * chevauchait avec eux. On isole donc le logo dans sa propre barre pleine
 * largeur, avec une bordure basse qui va jusqu'au bout de l'écran : le rail
 * de navigation et le contenu commencent proprement en dessous.
 *
 * Mobile : masquée (le TopBar mobile porte déjà le logo).
 */
export default function DesktopTopBar({ href = '/caisse' }: { href?: string }) {
  const brand = useBrand();
  return (
    <header className="hidden md:flex items-center h-16 shrink-0 bg-white border-b border-border px-4 relative z-40">
      <Link href={href} className="flex items-center" title="Accueil">
        {brand.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo_url}
            alt={brand.brand_name}
            className="h-10 w-auto max-w-[160px] object-contain object-left"
          />
        ) : (
          <span
            className="grid h-10 w-10 place-items-center rounded-2xl text-white font-semibold text-lg"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {(brand.brand_name || 'H').charAt(0)}
          </span>
        )}
      </Link>
    </header>
  );
}
