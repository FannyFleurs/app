/**
 * Index fonctionnel de HelloPos.
 *
 * Chaque entrée correspond à une fonction réellement présente dans le
 * logiciel (écran de caisse, back-office ou réglages). Rien n'est ajouté
 * « pour faire joli » : cette liste sert d'index sur l'accueil, de plan de la
 * page /fonctionnalites et de source pour les pages métier.
 */

export type IconName =
  | 'cart' | 'receipt' | 'refund' | 'gift' | 'return'
  | 'orders' | 'pickup' | 'truck' | 'workshop'
  | 'box' | 'inventory' | 'tag' | 'supplier'
  | 'users' | 'loyalty' | 'wallet'
  | 'chart' | 'report' | 'lock' | 'ledger'
  | 'stores' | 'team' | 'key' | 'transfer';

export interface FeatureItem {
  label: string;
  /** Précision affichée au survol / en légende. Facultative. */
  hint?: string;
  icon: IconName;
}

export interface FeatureGroup {
  /** Verbe de la journée du commerçant : Vendre, Préparer, Gérer… */
  title: string;
  /** Phrase courte qui donne le ton du groupe. */
  intro: string;
  icon: IconName;
  items: FeatureItem[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: 'Vendre',
    intro: 'Le comptoir, sans friction.',
    icon: 'cart',
    items: [
      { label: 'Encaissement', hint: 'Tuiles par famille, recherche, scan, paniers en attente.', icon: 'cart' },
      { label: 'Tickets', hint: 'Ticket imprimé ou envoyé par email, ticket cadeau sans prix.', icon: 'receipt' },
      { label: 'Avoirs', hint: 'Un retour, un avoir, rattaché à la fiche client.', icon: 'refund' },
      { label: 'Cartes cadeaux', hint: 'Émission, contrôle du solde, utilisation en caisse.', icon: 'gift' },
      { label: 'Retours', hint: 'Reprise d’article avec remise en stock.', icon: 'return' },
    ],
  },
  {
    title: 'Préparer',
    intro: 'Ce qui part plus tard s’organise maintenant.',
    icon: 'orders',
    items: [
      { label: 'Commandes', hint: 'Commande différée avec date de retrait ou de livraison.', icon: 'orders' },
      { label: 'Retraits', hint: 'La commande attend au bon endroit, à la bonne date.', icon: 'pickup' },
      { label: 'Livraisons', hint: 'Adresse, créneau, frais de transport.', icon: 'truck' },
      { label: 'Atelier', hint: 'Écran mural : ce qu’il y a à préparer aujourd’hui.', icon: 'workshop' },
    ],
  },
  {
    title: 'Gérer',
    intro: 'Ce qui entre, ce qui sort, ce qu’il reste.',
    icon: 'box',
    items: [
      { label: 'Stocks', hint: 'Entrées, sorties, mouvements tracés à la vente.', icon: 'box' },
      { label: 'Inventaires', hint: 'Comptage par boutique, écarts, validation.', icon: 'inventory' },
      { label: 'Étiquettes', hint: 'Codes-barres imprimés au comptoir ou depuis un PDA.', icon: 'tag' },
      { label: 'Fournisseurs', hint: 'Références, prix d’achat, marges.', icon: 'supplier' },
    ],
  },
  {
    title: 'Fidéliser',
    intro: 'Vos clients, reconnus au comptoir.',
    icon: 'users',
    items: [
      { label: 'Clients', hint: 'Fiche, historique d’achats, coordonnées.', icon: 'users' },
      { label: 'Fidélité', hint: 'Points cumulés à la vente, récompense au comptoir.', icon: 'loyalty' },
      { label: 'Wallet', hint: 'Carte de fidélité ajoutée à Apple Wallet.', icon: 'wallet' },
    ],
  },
  {
    title: 'Piloter',
    intro: 'La journée est finie. Les chiffres sont prêts.',
    icon: 'chart',
    items: [
      { label: 'Chiffre d’affaires', hint: 'En direct, par boutique, sur votre téléphone.', icon: 'chart' },
      { label: 'Rapports', hint: 'Ventes, TVA, moyens de paiement, produits.', icon: 'report' },
      { label: 'Clôtures', hint: 'Comptage, écarts, rapport Z imprimé.', icon: 'lock' },
      { label: 'Comptabilité', hint: 'Exports d’écritures pour votre cabinet.', icon: 'ledger' },
    ],
  },
  {
    title: 'Grandir',
    intro: 'Une boutique aujourd’hui. Plusieurs demain.',
    icon: 'stores',
    items: [
      { label: 'Multi-boutiques', hint: 'Catalogue partagé, activité consolidée.', icon: 'stores' },
      { label: 'Utilisateurs', hint: 'Un compte par personne, un code par vendeur.', icon: 'team' },
      { label: 'Permissions', hint: 'Chaque rôle voit ce qui le concerne.', icon: 'key' },
      { label: 'Transferts', hint: 'Le stock circule entre vos boutiques.', icon: 'transfer' },
    ],
  },
];

/** Sections détaillées de la page /fonctionnalites, dans l'ordre d'affichage. */
export interface FeatureSection {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  points: string[];
  screen?: { src: string; alt: string; caption?: string; crop?: 'top' | 'right' | 'left' };
  /** Colonne image à gauche plutôt qu'à droite. */
  reverse?: boolean;
}

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: 'encaissement',
    eyebrow: 'Vendre',
    title: 'Encaissez sans réfléchir.',
    lede:
      'Les familles d’articles en tuiles, une barre qui cherche et qui scanne, le panier à droite. ' +
      'Un client pressé pendant qu’un autre hésite ? Le panier passe en attente et revient en un geste.',
    points: [
      'Recherche et douchette dans le même champ',
      'Panier en attente, remise, commentaire de ligne',
      'Client associé à la vente en un tap',
      'Ticket imprimé, envoyé par email, ou ticket cadeau sans prix',
      'Espèces, carte, chèque, carte cadeau, avoir : plusieurs règlements sur une même vente',
    ],
    screen: { src: '/site/screens/caisse.png', alt: 'Écran de caisse HelloPos : familles d’articles, recherche, panier en cours' },
  },
  {
    id: 'stocks',
    eyebrow: 'Gérer',
    title: 'Ce qui entre. Ce qui sort. Ce qu’il reste.',
    lede:
      'Chaque vente met le stock à jour. Les réceptions, les pertes et les transferts laissent une trace. ' +
      'L’inventaire se compte boutique par boutique, et les écarts sautent aux yeux.',
    points: [
      'Mouvements de stock tracés à la vente comme à la réception',
      'Inventaire par boutique avec écarts et validation',
      'Fournisseurs, prix d’achat et marge par article',
      'Étiquettes code-barres imprimées au comptoir ou depuis un PDA',
    ],
    screen: { src: '/site/screens/stock.png', alt: 'Écran de gestion des stocks HelloPos' },
    reverse: true,
  },
  {
    id: 'commandes',
    eyebrow: 'Préparer',
    title: 'Une commande pour samedi ? Elle est déjà au bon endroit.',
    lede:
      'La commande se prend en caisse, avec sa date, son acompte et son mode de remise. ' +
      'Elle apparaît ensuite dans la liste du jour, et sur l’écran de l’atelier.',
    points: [
      'Commande différée avec date de retrait ou de livraison',
      'Acompte encaissé, solde au retrait',
      'Adresse de livraison et frais de transport',
      'Écran atelier : la préparation du jour, affichée au mur',
    ],
    screen: {
      src: '/site/screens/commandes.png',
      alt: 'Écran Commandes de HelloPos : compteurs du jour, à venir, en préparation',
      crop: 'top',
    },
  },
  {
    id: 'clients',
    eyebrow: 'Fidéliser',
    title: 'Retrouvez un client en quelques secondes.',
    lede:
      'Un nom, un téléphone, et l’historique remonte : ce qu’il a acheté, ses avoirs, ses points. ' +
      'La carte de fidélité peut vivre dans Apple Wallet plutôt qu’au fond d’un sac.',
    points: [
      'Fiche client avec historique d’achats et avoirs',
      'Points de fidélité cumulés automatiquement à la vente',
      'Carte de fidélité ajoutée à Apple Wallet',
      'Clients professionnels avec facturation dédiée',
    ],
    screen: { src: '/site/screens/caisse-paiement.png', alt: 'Encaissement HelloPos avec client associé à la vente' },
    reverse: true,
  },
  {
    id: 'facturation',
    eyebrow: 'Facturer',
    title: 'Les factures pros, sans quitter la caisse.',
    lede:
      'Un hôtel, un restaurant, une entreprise : la vente devient une facture au bon format, ' +
      'avec les mentions de règlement et le RIB de la boutique.',
    points: [
      'Factures et avoirs numérotés en séquence continue',
      'Comptes professionnels et conditions de règlement',
      'Coordonnées bancaires et mentions légales paramétrables',
      'Réglages dédiés à la facturation électronique',
    ],
    screen: { src: '/site/screens/rapports.png', alt: 'Rapports et éditions dans le back-office HelloPos' },
  },
  {
    id: 'pilotage',
    eyebrow: 'Piloter',
    title: 'Vous savez exactement où en est votre commerce.',
    lede:
      'Chiffre d’affaires, ticket moyen, marge, TVA collectée : le tableau de bord répond avant que ' +
      'la question soit posée. Depuis la boutique, ou depuis ailleurs.',
    points: [
      'Tableau de bord par période et par boutique',
      'Comparaison avec la période précédente',
      'Rapports ventes, TVA, moyens de paiement, produits',
      'Historique détaillé des ventes et des opérations sensibles',
    ],
    screen: {
      src: '/site/screens/dashboard.png',
      alt: 'Tableau de bord HelloPos : chiffre d’affaires, ticket moyen, TVA collectée',
      caption: 'Capture réalisée sur un environnement de démonstration.',
    },
    reverse: true,
  },
  {
    id: 'multi-boutiques',
    eyebrow: 'Grandir',
    title: 'Une boutique aujourd’hui. Plusieurs demain.',
    lede:
      'Le catalogue est partagé, l’activité se consolide, le stock circule. ' +
      'Chaque boutique garde ses prix de vente, ses utilisateurs et sa caisse.',
    points: [
      'Plusieurs boutiques dans la même organisation',
      'Transferts de stock entre boutiques',
      'Utilisateurs, rôles et permissions par périmètre',
      'Suivi du chiffre d’affaires consolidé',
    ],
    screen: { src: '/site/screens/ma-journee.png', alt: 'Suivi de la journée en cours dans HelloPos' },
  },
  {
    id: 'comptabilite',
    eyebrow: 'Clôturer',
    title: 'La journée est terminée. Vos chiffres sont déjà prêts.',
    lede:
      'La clôture compte la caisse, affiche les écarts, scelle la journée et imprime le rapport Z. ' +
      'Le comptable, lui, reçoit des exports qu’il attendait.',
    points: [
      'Fond de caisse, comptage des espèces, écarts affichés',
      'Rapport Z imprimé à la clôture',
      'Exports comptables (ventes par compte, écritures)',
      'Journal des événements fiscaux consultable',
    ],
    screen: { src: '/site/screens/cloture.png', alt: 'Écran de clôture de caisse HelloPos' },
    reverse: true,
  },
];
