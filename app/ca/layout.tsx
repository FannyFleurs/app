import './layout.css';
import type { Metadata } from 'next';
import FaviconSetter from '@/components/FaviconSetter';

export const metadata: Metadata = {
  title: 'Chiffre d\'affaires — HelloPos',
  description: 'Suivi du chiffre d\'affaires en direct.',
  // Manifest PWA dédié à l'espace CA : start_url /ca (jamais la caisse) +
  // icônes CA. Surcharge le manifest racine (start_url /caisse).
  manifest: '/manifest-ca.json',
  // Icône d'écran d'accueil iOS = favicon CA servi en vraie image.
  icons: {
    icon: '/api/brand/icon?scope=ca',
    apple: '/api/brand/icon?scope=ca&size=180',
  },
  appleWebApp: {
    capable: true,
    title: 'CA en direct',
  },
};

/**
 * Layout autonome pour le sous-domaine ca. — pas de sidebar, pas de
 * topbar HelloPos, juste le contenu propre au dashboard.
 * FaviconSetter applique le favicon CA dédié (distinct de la caisse).
 */
export default function CALayout({ children }: { children: React.ReactNode }) {
  // Pas de div englobante : le <body> (root layout) fournit déjà
  // min-h-screen + fond. Éviter un double conteneur garantit que l'écran
  // de connexion CA est positionné EXACTEMENT comme les autres.
  return (
    <>
      <FaviconSetter />
      {children}
    </>
  );
}
