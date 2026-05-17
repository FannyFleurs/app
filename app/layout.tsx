import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Florea POS',
  description:
    'Caisse SaaS pour fleuristes — conforme by design aux exigences françaises de l\'article 286, I, 3°bis du CGI.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
