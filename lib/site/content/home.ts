/**
 * Contenus narratifs de la page d'accueil.
 *
 * Les captures citées sont les captures réelles du logiciel présentes dans
 * /public/site/screens. Aucune interface n'est inventée : quand une étape
 * n'a pas de capture dédiée, on recadre une capture existante sur la partie
 * concernée (champ `crop`).
 */

import type { IconName } from './features';

/* ------------------------------------------------------------------ */
/* « Tout est lié » — les briques de l'activité et leurs connexions.    */
/* ------------------------------------------------------------------ */

export interface LinkedNode {
  label: string;
  icon: IconName;
  /** Ce que la brique reçoit ou envoie, en une ligne. */
  note: string;
}

export const LINKED_NODES: LinkedNode[] = [
  { label: 'Caisse', icon: 'cart', note: 'Le point de départ de presque tout.' },
  { label: 'Stocks', icon: 'box', note: 'Chaque vente met le stock à jour.' },
  { label: 'Clients', icon: 'users', note: 'La vente s’attache à une fiche.' },
  { label: 'Commandes', icon: 'orders', note: 'Ce qui part plus tard a déjà sa date.' },
  { label: 'Livraisons', icon: 'truck', note: 'Adresse, créneau, frais de transport.' },
  { label: 'Facturation', icon: 'ledger', note: 'La vente pro devient une facture.' },
  { label: 'Équipe', icon: 'team', note: 'Chacun son compte, chacun ses droits.' },
  { label: 'Comptabilité', icon: 'report', note: 'La journée finit en écritures.' },
];

/* ------------------------------------------------------------------ */
/* « HelloPos en action » — 5 étapes, 5 écrans.                         */
/* ------------------------------------------------------------------ */

export interface StoryStep {
  index: string;
  title: string;
  text: string;
  screen: { src: string; alt: string; crop?: 'right' | 'left' | 'top'; caption?: string };
}

export const STORY_STEPS: StoryStep[] = [
  {
    index: '01',
    title: 'Encaissez sans réfléchir.',
    text:
      'Une interface rapide pour aller droit à l’essentiel : vos produits, vos clients et vos encaissements. ' +
      'Les familles en tuiles, la recherche et la douchette dans le même champ, le panier toujours visible.',
    screen: { src: '/site/screens/caisse.png', alt: 'Écran de caisse HelloPos : familles d’articles et panier en cours' },
  },
  {
    index: '02',
    title: 'Retrouvez un client en quelques secondes.',
    text:
      'Le client s’associe à la vente en un tap. Derrière, son historique, ses avoirs et ses points de fidélité ' +
      'suivent tout seuls — y compris sa carte dans Apple Wallet.',
    screen: {
      src: '/site/screens/caisse.png',
      alt: 'Panier HelloPos avec le bouton « Associer un client »',
      crop: 'right',
    },
  },
  {
    index: '03',
    title: 'Une commande pour samedi ? Elle est déjà au bon endroit.',
    text:
      'Date de retrait ou de livraison, acompte encaissé, solde au retrait. La commande rejoint la liste du jour ' +
      'concerné, et l’écran de l’atelier avec les offres Pro et Réseau.',
    screen: {
      src: '/site/screens/commandes.png',
      alt: 'Écran Commandes de HelloPos : compteurs du jour, à venir, en préparation',
      crop: 'top',
    },
  },
  {
    index: '04',
    title: 'Ce qui entre. Ce qui sort. Ce qu’il reste.',
    text:
      'Les ventes, les réceptions, les pertes et les transferts alimentent les mouvements de stock. ' +
      'L’inventaire se compte boutique par boutique, écarts affichés avant validation.',
    screen: { src: '/site/screens/stock.png', alt: 'Écran de gestion des stocks HelloPos' },
  },
  {
    index: '05',
    title: 'Vous savez exactement où en est votre commerce.',
    text:
      'Chiffre d’affaires, ticket moyen, marge, TVA collectée, comparés à la période précédente. ' +
      'Depuis la boutique, ou depuis ailleurs.',
    screen: {
      src: '/site/screens/dashboard.png',
      alt: 'Tableau de bord HelloPos : chiffre d’affaires, ticket moyen, TVA collectée',
      caption: 'Capture réalisée sur un environnement de démonstration.',
    },
  },
];

/* ------------------------------------------------------------------ */
/* « Une journée avec HelloPos » — timeline.                            */
/* ------------------------------------------------------------------ */

export interface DayMoment {
  time: string;
  title: string;
  text: string;
  icon: IconName;
}

export const DAY_MOMENTS: DayMoment[] = [
  {
    time: '8h52',
    title: 'Réception de marchandise',
    text: 'Les quantités entrent en stock avant l’ouverture. Les étiquettes partent à l’imprimante.',
    icon: 'box',
  },
  {
    time: '10h13',
    title: 'Premier encaissement',
    text: 'Deux articles, un client fidèle, un ticket par email. Le stock a déjà bougé.',
    icon: 'cart',
  },
  {
    time: '12h26',
    title: 'Commande pour demain',
    text: 'Date de retrait, acompte encaissé. Elle apparaît dans la préparation du lendemain.',
    icon: 'orders',
  },
  {
    time: '15h48',
    title: 'Rupture sur un article',
    text: 'Le stock est à zéro, l’article se voit dans la liste. La commande fournisseur peut partir.',
    icon: 'inventory',
  },
  {
    time: '18h57',
    title: 'Clôture de la journée',
    text: 'Comptage, écart affiché, journée scellée, rapport Z imprimé. Les chiffres sont déjà prêts.',
    icon: 'lock',
  },
];

/* ------------------------------------------------------------------ */
/* Accompagnement.                                                      */
/* ------------------------------------------------------------------ */

export interface OnboardingStep {
  index: string;
  title: string;
  text: string;
}

export const ONBOARDING: OnboardingStep[] = [
  {
    index: '01',
    title: 'On découvre votre commerce.',
    text:
      'Ce que vous vendez, comment vous encaissez, ce qui vous fait perdre du temps aujourd’hui. ' +
      'Un échange, pas un questionnaire.',
  },
  {
    index: '02',
    title: 'On configure HelloPos.',
    text:
      'Société, boutique, caisse, taux de TVA, familles d’articles, utilisateurs et matériel : ' +
      'l’espace est prêt avant votre première vente.',
  },
  {
    index: '03',
    title: 'On vous accompagne au démarrage.',
    text:
      'La prise en main se fait sur votre catalogue et vos habitudes, avec les personnes qui tiendront la caisse.',
  },
  {
    index: '04',
    title: 'On reste disponible.',
    text:
      'Une question, un besoin d’ajustement, une nouvelle boutique : vous nous écrivez, nous répondons.',
  },
];

/* ------------------------------------------------------------------ */
/* Conformité — réassurance de l'accueil.                               */
/* ------------------------------------------------------------------ */

export const COMPLIANCE_POINTS: { title: string; text: string }[] = [
  {
    title: 'Une chaîne scellée',
    text: 'Chaque vente, avoir et clôture est enregistré dans un journal d’événements chaînés par empreinte, protégé contre la modification et la suppression.',
  },
  {
    title: 'Une numérotation continue',
    text: 'Tickets, factures et clôtures sont numérotés en séquence, sans rupture, avec un cumul perpétuel du grand total.',
  },
  {
    title: 'Un rapport Z à chaque clôture',
    text: 'La journée est figée : total des ventes, TVA, moyens de règlement, écart de caisse. Le rapport s’imprime sur l’imprimante ticket.',
  },
  {
    title: 'Des exports pour le cabinet',
    text: 'Ventes par compte et écritures comptables se téléchargent depuis le back-office, au format attendu par votre comptable.',
  },
];
