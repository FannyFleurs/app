/**
 * « Cet article est-il à compter dans CETTE boutique ? »
 *
 * Un inventaire appartient à une boutique. Jusqu'ici la création par catégorie
 * proposait les catégories de toute l'organisation, et le pré-remplissage
 * prenait tous les articles : à Mortagne on se voyait proposer les catégories
 * d'Alençon, et les cocher ne produisait que des lignes à zéro — des écarts
 * inventés, à justifier un par un.
 *
 * Trois portes, dans cet ordre d'évidence :
 *   1. l'article n'est rattaché à aucune boutique (donc partagé par toutes) ;
 *   2. il est explicitement rattaché à celle-ci ;
 *   3. il y a du stock ici — quelle que soit la configuration, ce qui est dans
 *      les rayons doit être compté.
 *
 * Le fragment est partagé pour que la liste proposée et les lignes réellement
 * créées répondent EXACTEMENT au même critère : deux définitions divergentes
 * donneraient une catégorie proposée puis un inventaire vide.
 *
 * `param` est le placeholder SQL qui porte l'identifiant de boutique (`$2`…),
 * et la table `products` doit être aliasée `p`.
 */
export function produitDansBoutique(param: string): string {
  return `(
    COALESCE(array_length(p.store_ids, 1), 0) = 0
    OR p.store_ids @> ARRAY[${param}]::uuid[]
    OR EXISTS (SELECT 1 FROM stock_levels sl
                WHERE sl.product_id = p.id AND sl.store_id = ${param})
  )`;
}
