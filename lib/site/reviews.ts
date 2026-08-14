/**
 * Témoignages clients affichés sur le site vitrine (page Avis + preuve
 * sociale sur l'accueil). Prénoms abrégés pour préserver la confidentialité.
 */
export type Review = { name: string; shop: string; city: string; stars: number; quote: string };

export const REVIEWS: Review[] = [
  {
    name: 'Camille R.', shop: 'Atelier floral', city: 'Lyon', stars: 5,
    quote: 'On encaisse deux fois plus vite qu’avant. Les tuiles par famille, le rendu monnaie, les paniers en attente : tout est là. Mon équipe a pris la caisse en main en une matinée.',
  },
  {
    name: 'Thomas L.', shop: 'Concept store', city: 'Bordeaux', stars: 5,
    quote: 'Le pilotage à distance a tout changé. Je vois le chiffre d’affaires de mes deux boutiques en direct depuis mon téléphone, même quand je suis en déplacement.',
  },
  {
    name: 'Nadia B.', shop: 'Boutique de plantes', city: 'Nantes', stars: 5,
    quote: 'La commande différée est parfaite pour les retraits à date. Fini les post-it au comptoir : tout est suivi, et le client reçoit sa confirmation automatiquement.',
  },
  {
    name: 'Sophie D.', shop: 'Cave à vins', city: 'Lille', stars: 5,
    quote: 'La clôture guidée et le rapport Z imprimé m’ont réconciliée avec la comptabilité. Mon expert-comptable reçoit les exports en un clic, au bon format.',
  },
  {
    name: 'Karim S.', shop: 'Fleuriste', city: 'Paris', stars: 5,
    quote: 'Enfin une caisse qui gère les avoirs proprement. Reprise d’un article, avoir imprimé sur le ticket, visible sur la fiche client : plus aucune ardoise perdue.',
  },
  {
    name: 'Marine T.', shop: 'Boutique déco', city: 'Aix-en-Provence', stars: 5,
    quote: 'Les cartes de fidélité dans Apple Wallet plaisent énormément. Les clients scannent, les points montent tout seuls, et ils reviennent. Un vrai plus au comptoir.',
  },
  {
    name: 'Julien M.', shop: 'Épicerie fine', city: 'Toulouse', stars: 4,
    quote: 'Installation accompagnée au top, catalogue prêt dès le premier jour. Il me tarde surtout de voir les prochaines nouveautés côté gestion de stock.',
  },
  {
    name: 'Élodie F.', shop: 'Torréfacteur', city: 'Strasbourg', stars: 5,
    quote: 'Le mode hors-ligne m’a sauvé un samedi de coupure réseau. On a continué à encaisser sans rien perdre, et tout s’est resynchronisé une fois la connexion revenue.',
  },
  {
    name: 'Antoine G.', shop: 'Jardinerie', city: 'Rennes', stars: 5,
    quote: 'Multi-boutiques, catalogue partagé, transferts de stock : on pilote nos trois points de vente comme s’il n’y en avait qu’un. Le back-office suit tout.',
  },
  {
    name: 'Laure P.', shop: 'Boutique cadeaux', city: 'Montpellier', stars: 5,
    quote: 'Les étiquettes code-barres imprimées à la volée et le scan au comptoir font gagner un temps fou sur les grosses journées. C’est fluide, même en rush.',
  },
  {
    name: 'Vincent C.', shop: 'Primeur', city: 'Annecy', stars: 5,
    quote: 'Simple pour l’équipe, complet pour moi. La conformité fiscale est intégrée, je n’y pense tout simplement plus. Exactement ce que je cherchais.',
  },
];

/** Note moyenne formatée en français (ex. "4,9"). */
export const REVIEW_AVG = (REVIEWS.reduce((s, r) => s + r.stars, 0) / REVIEWS.length)
  .toFixed(1)
  .replace('.', ',');
