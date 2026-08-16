import type { Viewport } from 'next';
import '../site/site.css';

/**
 * Gabarit de la page d'attente.
 *
 * Volontairement hors de `app/site` : la page ne doit hériter ni de l'en-tête,
 * ni du pied de page du site public, dont toutes les entrées seraient des
 * impasses tant que le site est dépublié. Elle reprend en revanche le design
 * system (site.css) via la classe racine `.hp`.
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#013E37',
};

export default function HoldingLayout({ children }: { children: React.ReactNode }) {
  return <div className="hp hp-dark hp-on-green">{children}</div>;
}
