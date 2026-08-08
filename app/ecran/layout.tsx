import type { Metadata } from 'next';

/**
 * L'écran atelier est une PWA distincte de la caisse : son propre manifest
 * démarre sur /ecran. Ajouté à l'écran d'accueil d'une tablette murale, il
 * ouvre l'atelier — et non la caisse.
 */
export const metadata: Metadata = {
  title: 'Écran atelier',
  applicationName: 'Écran atelier',
  manifest: '/manifest-ecran.json',
  icons: {
    icon: [{ url: '/api/brand/icon' }],
    apple: [{ url: '/api/brand/icon?size=180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Écran atelier',
    statusBarStyle: 'black-translucent',
  },
};

export default function EcranLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <meta name="apple-mobile-web-app-title" content="Écran atelier" />
      <link rel="manifest" href="/manifest-ecran.json" />
      {children}
    </>
  );
}
