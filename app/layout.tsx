import './globals.css';
import type { Metadata, Viewport } from 'next';
import FaviconSetter from '@/components/FaviconSetter';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import DialogHost from '@/lib/ui/dialog';

export const metadata: Metadata = {
  title: 'HelloPos',
  description:
    'Caisse SaaS pour commerces de détail — conforme by design aux exigences françaises de l\'article 286, I, 3°bis du CGI.',
  applicationName: 'HelloPos',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'HelloPos',
    // Barre d'état OPAQUE claire (texte noir), pas translucide : l'app est
    // claire, et une barre translucide se superposait au contenu en y posant
    // un voile dégradé — le « halo » en haut de l'écran en mode plein écran
    // (app ajoutée à l'écran d'accueil). En `default`, iOS dessine une barre
    // pleine qui prolonge l'en-tête blanc, sans halo.
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    // Icône neutre par défaut (SVG sans lettre) + favicon dynamique
    // (/api/brand/icon) qui reflète le logo configuré. Plus jamais l'ancien
    // monogramme « F ». FaviconSetter (client) surcharge ensuite au besoin.
    icon: [
      { url: '/api/brand/icon?scope=app' },
    ],
    apple: [
      { url: '/api/brand/icon?scope=app&size=180' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // themeColor par defaut blanc — sera surcharge dynamiquement par
  // AppShell selon la couleur d'accent choisie dans /settings/pos-ui.
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* iOS PWA — barre de statut opaque claire (texte noir), qui prolonge
            l'en-tête blanc sans voile ni halo. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="HelloPos" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Évite l'auto-zoom iOS sur les inputs (taille de police >= 16px) */}
        <meta name="format-detection" content="telephone=no,email=no,address=no" />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased select-none touch-manipulation">
        <FaviconSetter />
        <ServiceWorkerRegister />
        {children}
        <DialogHost />
      </body>
    </html>
  );
}
