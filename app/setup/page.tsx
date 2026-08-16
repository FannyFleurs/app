import { redirect } from 'next/navigation';
import { isSitePublic } from '@/lib/site/publication';
import SetupWizard from './SetupWizard';

export const dynamic = 'force-dynamic';

/**
 * Création d'un espace en libre-service.
 *
 * Elle suit la publication du site public : tant que le site n'est pas
 * activé (Configuration → Site public), l'assistant est fermé et le visiteur
 * est renvoyé sur l'écran d'attente.
 */
export default async function SetupPage() {
  if (!(await isSitePublic())) redirect('/');
  return <SetupWizard />;
}
