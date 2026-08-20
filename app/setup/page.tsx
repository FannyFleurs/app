import SetupWizard from './SetupWizard';

export const dynamic = 'force-dynamic';

/**
 * Création d'un espace en libre-service.
 *
 * Ouvert indépendamment de la publication du site vitrine : la création de
 * caisse doit rester possible même quand le site public est encore en écran
 * d'attente (le bouton « Créer ma caisse » y renvoie).
 */
export default function SetupPage() {
  return <SetupWizard />;
}
