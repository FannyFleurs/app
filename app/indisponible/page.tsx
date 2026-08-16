import type { Metadata } from 'next';
import { HOME_TITLE, HOME_DESCRIPTION } from '@/lib/site/meta';
import HoldingScreen from '../site/_components/HoldingScreen';

export const dynamic = 'force-dynamic';

/**
 * Page d'attente, accessible à son adresse propre.
 *
 * La racine du domaine public affiche le même écran sans changer d'URL (voir
 * `app/site/layout.tsx`) ; cette route sert à le relire, notamment depuis la
 * console d'administration avant d'activer ou de désactiver le site.
 *
 * Le titre est celui de l'accueil : seule l'indexation change. `noindex`
 * tant que le site n'est pas publié, `follow` pour que les moteurs retrouvent
 * les pages le jour de la publication.
 */
export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  robots: { index: false, follow: true },
};

export default function HoldingPage() {
  return <HoldingScreen />;
}
