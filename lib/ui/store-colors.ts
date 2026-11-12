/**
 * Palette de puces couleur par boutique — reprend des teintes des thèmes de
 * marque existants, pour rester dans l'identité HelloPos plutôt que des
 * couleurs arbitraires. Cycle si plus de boutiques que de couleurs.
 *
 * Convention : indexer par la position de la boutique dans la liste des
 * boutiques de l'organisation triée par nom (`ORDER BY name`), pour qu'une
 * même boutique garde la même couleur partout où cette liste est utilisée
 * dans le même écran — jamais par une couleur stockée en base (aucune
 * colonne couleur sur `stores`).
 */
export const STORE_DOT_COLORS = ['#013E37', '#B7791F', '#5C6F5D', '#1F3A5F', '#B5683E', '#7A3C6E'];

export function storeDotColor(index: number): string {
  return STORE_DOT_COLORS[index % STORE_DOT_COLORS.length]!;
}
