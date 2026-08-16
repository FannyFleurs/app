import type { Metadata } from 'next';
import HoldingScreen from '../site/_components/HoldingScreen';

export const dynamic = 'force-dynamic';

/**
 * Page d'attente, accessible à son adresse propre.
 *
 * La racine du domaine public affiche le même écran sans changer d'URL (voir
 * `app/site/layout.tsx`) ; cette route sert à le relire, notamment depuis la
 * console d'administration avant d'activer ou de désactiver le site.
 *
 * `noindex` : rien à indexer tant que le site n'est pas publié. Le suivi des
 * liens reste autorisé pour que les moteurs retrouvent les pages le jour de
 * la publication.
 */
export const metadata: Metadata = {
  title: 'HelloPos',
  description: 'Le site HelloPos n’est pas accessible pour le moment.',
  robots: { index: false, follow: true },
};

export default function HoldingPage() {
  return <HoldingScreen />;
}
