/**
 * Règle « article suivi en stock ».
 *
 * C'est désormais un choix explicite du commerçant : la case « Gérer le stock »
 * de la fiche article (`products.track_stock`).
 *
 * Auparavant la caisse décidait seule — un article était suivi s'il avait un
 * code-barres et n'était pas dans la catégorie « Livraison ». Cette règle ne
 * figurait nulle part dans l'interface : impossible de la lire depuis la fiche,
 * impossible de la contredire. Un bouquet composé au comptoir n'était jamais
 * décompté, un article étiqueté l'était toujours.
 *
 * Décochée, la case ne se contente pas de masquer le stock : AUCUN mouvement
 * n'est écrit — donc pas de quantité négative à traîner sur un article qu'on ne
 * compte pas.
 *
 * `STOCK_TRACKED_SQL` est un fragment SQL réutilisable, qui suppose l'alias
 * `p` pour la table `products`.
 */
export const STOCK_TRACKED_SQL = 'p.track_stock';
