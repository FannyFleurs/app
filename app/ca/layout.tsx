import './layout.css';
import FaviconSetter from '@/components/FaviconSetter';

export const metadata = {
  title: 'Chiffre d\'affaires — HelloPos',
  description: 'Suivi du chiffre d\'affaires en direct.',
};

/**
 * Layout autonome pour le sous-domaine ca. — pas de sidebar, pas de
 * topbar HelloPos, juste le contenu propre au dashboard.
 * FaviconSetter applique le favicon CA dédié (distinct de la caisse).
 */
export default function CALayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <FaviconSetter />
      {children}
    </div>
  );
}
