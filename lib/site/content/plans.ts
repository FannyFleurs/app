/**
 * Formules HelloPos et tableau comparatif.
 *
 * Les montants et les noms d'offre affichés proviennent des réglages de la
 * plateforme (`platform_settings`) ; les valeurs par défaut du produit sont
 * Smart 29 €, Pro 39 €, Réseau 69 € HT/mois.
 *
 * IMPORTANT — les différences entre offres décrites ici sont celles que le
 * logiciel applique réellement :
 *   - nombre de boutiques et de caisses : `lib/billing/plan-limits.ts` ;
 *   - réglages « Écran & Livraison » réservés à Pro et Réseau :
 *     `app/(app)/settings/layout.tsx` (proOnly) et `settings/screen-delivery` ;
 *   - périmètre multi-boutiques du programme de fidélité :
 *     `app/(app)/settings/loyalty/page.tsx` (scopeAvailable).
 * Aucune autre restriction n'existe dans le produit : tout le reste est donc
 * marqué comme inclus dans les trois offres.
 */

export type PlanKey = 'smart' | 'pro' | 'reseau';

export interface Plan {
  key: PlanKey;
  /** Nom par défaut ; surchargé par les réglages plateforme. */
  name: string;
  /** Montant par défaut en € HT/mois ; surchargé par les réglages. */
  price: string;
  tagline: string;
  /** Pour qui, en une phrase. */
  audience: string;
  highlights: string[];
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: 'smart',
    name: 'Smart',
    price: '29',
    tagline: 'Une boutique, une caisse, tout le logiciel.',
    audience: 'Le commerce qui démarre avec HelloPos.',
    highlights: [
      '1 boutique · 1 caisse',
      'Caisse supplémentaire en option',
      'Catalogue, stocks et inventaires',
      'Clients et fidélité',
      'Rapports, clôtures et exports comptables',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '39',
    tagline: 'Plusieurs postes, et la préparation en plus.',
    audience: 'La boutique qui prépare, livre et tourne à plusieurs.',
    featured: true,
    highlights: [
      '1 boutique · jusqu’à 5 caisses',
      'Écran atelier et livraison',
      'Fidélité étendue à votre périmètre',
      'Tout ce que contient Smart',
    ],
  },
  {
    key: 'reseau',
    name: 'Réseau',
    price: '69',
    tagline: 'Plusieurs boutiques, pilotées comme une seule.',
    audience: 'Le réseau de boutiques et les enseignes.',
    highlights: [
      'Boutiques illimitées · caisses illimitées',
      'Transferts de stock entre boutiques',
      'Activité consolidée, boutique par boutique',
      'Tout ce que contient Pro',
    ],
  },
];

/** Valeur d'une ligne du comparatif pour une offre. */
export type Cell = true | false | string;

export interface CompareRow {
  label: string;
  /** Précision affichée sous le libellé. */
  note?: string;
  smart: Cell;
  pro: Cell;
  reseau: Cell;
}

export interface CompareGroup {
  title: string;
  rows: CompareRow[];
}

export const COMPARE: CompareGroup[] = [
  {
    title: 'Périmètre',
    rows: [
      { label: 'Boutiques', smart: '1', pro: '1', reseau: 'Illimitées' },
      {
        label: 'Caisses par boutique',
        note: 'Une caisse supplémentaire peut être ajoutée à l’offre Smart, en option mensuelle.',
        smart: '1 (+ option)',
        pro: 'Jusqu’à 5',
        reseau: 'Illimitées',
      },
      { label: 'Utilisateurs', note: 'Un compte par personne, avec son code de caisse.', smart: 'Illimités', pro: 'Illimités', reseau: 'Illimités' },
      { label: 'Catalogue', smart: 'Illimité', pro: 'Illimité', reseau: 'Illimité' },
    ],
  },
  {
    title: 'Vendre',
    rows: [
      { label: 'Encaissement, paniers en attente, remises', smart: true, pro: true, reseau: true },
      { label: 'Règlements multiples sur une même vente', note: 'Espèces, carte, chèque, virement, carte cadeau, avoir, en compte.', smart: true, pro: true, reseau: true },
      { label: 'Ticket imprimé, ticket par email, ticket cadeau', smart: true, pro: true, reseau: true },
      { label: 'Avoirs et retours', smart: true, pro: true, reseau: true },
      { label: 'Cartes cadeaux', smart: true, pro: true, reseau: true },
    ],
  },
  {
    title: 'Préparer',
    rows: [
      { label: 'Commandes différées, retrait à date, acompte', smart: true, pro: true, reseau: true },
      {
        label: 'Écran atelier et livraison',
        note: 'Réglages « Écran & Livraison » : préparation affichée au mur, adresses et frais de transport.',
        smart: false,
        pro: true,
        reseau: true,
      },
    ],
  },
  {
    title: 'Gérer',
    rows: [
      { label: 'Stocks et mouvements', smart: true, pro: true, reseau: true },
      { label: 'Inventaires', smart: true, pro: true, reseau: true },
      { label: 'Fournisseurs, prix d’achat, marges', smart: true, pro: true, reseau: true },
      { label: 'Étiquettes code-barres', smart: true, pro: true, reseau: true },
      { label: 'Transferts de stock entre boutiques', note: 'Nécessite plusieurs boutiques.', smart: false, pro: false, reseau: true },
    ],
  },
  {
    title: 'Fidéliser',
    rows: [
      { label: 'Fiches clients et historique', smart: true, pro: true, reseau: true },
      { label: 'Programme de fidélité', smart: true, pro: true, reseau: true },
      { label: 'Carte de fidélité dans Apple Wallet', smart: true, pro: true, reseau: true },
      {
        label: 'Périmètre du programme de fidélité',
        note: 'Choisir les boutiques couvertes par le programme.',
        smart: 'Boutique',
        pro: 'Paramétrable',
        reseau: 'Paramétrable',
      },
      { label: 'Clients professionnels et factures', smart: true, pro: true, reseau: true },
    ],
  },
  {
    title: 'Piloter',
    rows: [
      { label: 'Tableau de bord et rapports', smart: true, pro: true, reseau: true },
      { label: 'Clôtures et rapport Z', smart: true, pro: true, reseau: true },
      { label: 'Exports comptables', smart: true, pro: true, reseau: true },
      { label: 'Back-office à distance', smart: true, pro: true, reseau: true },
      { label: 'Activité consolidée multi-boutiques', smart: false, pro: false, reseau: true },
    ],
  },
  {
    title: 'Accompagnement',
    rows: [
      { label: 'Essai de 14 jours', smart: true, pro: true, reseau: true },
      { label: 'Sans engagement', smart: true, pro: true, reseau: true },
      { label: 'Mises à jour incluses', smart: true, pro: true, reseau: true },
      { label: 'Assistance par email', smart: true, pro: true, reseau: true },
    ],
  },
];
