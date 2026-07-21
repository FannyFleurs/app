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
      {children}
    </>
  );
}
