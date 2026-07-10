import './globals.css';
import type { Metadata, Viewport } from 'next';
import InstallPrompt from '@/components/InstallPrompt';
import FaviconSetter from '@/components/FaviconSetter';

export const metadata: Metadata = {
  title: 'HelloPos',
  description:
    'Caisse SaaS pour fleuristes — conforme by design aux exigences françaises de l\'article 286, I, 3°bis du CGI.',
  applicationName: 'HelloPos',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'HelloPos',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
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
        {/* iOS PWA — barre de statut transparente, plein écran */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="HelloPos" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Évite l'auto-zoom iOS sur les inputs (taille de police >= 16px) */}
        <meta name="format-detection" content="telephone=no,email=no,address=no" />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased select-none touch-manipulation">
        <FaviconSetter />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
