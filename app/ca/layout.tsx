import './layout.css';

export const metadata = {
  title: 'Chiffre d\'affaires — Webpos',
  description: 'Suivi du chiffre d\'affaires en direct.',
};

/**
 * Layout autonome pour le sous-domaine ca. — pas de sidebar, pas de
 * topbar Webpos, juste le contenu propre au dashboard.
 */
export default function CALayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg text-ink">{children}</div>;
}
