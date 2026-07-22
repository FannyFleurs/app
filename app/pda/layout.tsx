import type { Metadata } from 'next';

/**
 * L'app PDA (étiquettes) est une PWA distincte de la caisse : son propre
 * manifest avec start_url = /pda. Ainsi, ajoutée à l'écran d'accueil iOS, elle
 * ouvre le PDA — et non la caisse (dont le manifest démarre sur /caisse).
 */
export const metadata: Metadata = {
  title: 'Étiquettes',
  applicationName: 'Étiquettes',
  manifest: '/manifest-pda.json',
  // Icône propre au PDA (favicon/logo PDA configuré) au lieu de celle de la
  // caisse. iOS home-screen : un PNG est fortement recommandé (SVG mal géré).
  icons: {
    icon: [
      { url: '/api/brand/icon?scope=pda' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/api/brand/icon?scope=pda' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Étiquettes',
    statusBarStyle: 'black-translucent',
  },
};

export default function PdaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* iOS lit ces balises pour l'icône « écran d'accueil » du PDA. */}
      <meta name="apple-mobile-web-app-title" content="Étiquettes" />
      <link rel="manifest" href="/manifest-pda.json" />
      <link rel="apple-touch-icon" href="/api/brand/icon?scope=pda" />
      {children}
    </>
  );
}
