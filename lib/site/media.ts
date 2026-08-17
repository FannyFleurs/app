/**
 * Emplacements photo du site.
 *
 * La direction photographique de HelloPos repose sur de vraies images de
 * commerces indépendants : lumière naturelle, matières, commerçants au
 * travail. Tant qu'une photo n'a pas été produite ou acquise pour un
 * emplacement, celui-ci n'affiche PAS d'image d'illustration générique : le
 * composant <Photo /> dessine une composition graphique aux couleurs de la
 * marque, qui tient sa place dans la mise en page.
 *
 * Pour publier une photo :
 *   1. déposer les fichiers dans /public/site/photos
 *      (idéalement `<slot>.avif`, `<slot>.webp` et un repli `<slot>.jpg` —
 *       `<slot>.png` si l'image a un fond transparent —, en 1600 px de large,
 *       plus `<slot>-m.*` en 800 px) ;
 *   2. déclarer l'emplacement ci-dessous avec son texte alternatif.
 *
 * Les fichiers sources non optimisés (exports haute résolution) restent hors
 * de /public : les ranger dans assets/site-sources, qui n'est pas déployé.
 *
 * Aucune autre modification n'est nécessaire : toutes les pages qui
 * utilisent l'emplacement basculent automatiquement sur la photo.
 */

export interface PhotoAsset {
  /** Chemin sans extension, ex. `/site/photos/atelier`. */
  base: string;
  /** Texte alternatif — décrire la scène, pas la marque. */
  alt: string;
  /** Extensions disponibles, dans l'ordre de préférence. */
  formats?: ('avif' | 'webp' | 'png' | 'jpg')[];
  /**
   * Extension du fichier de repli, servi aux navigateurs qui ne lisent aucun
   * des formats ci-dessus. `png` pour une image à fond transparent — le JPEG
   * aplatirait la transparence sur du blanc.
   */
  fallback?: 'jpg' | 'png';
  /** Variante 800 px disponible (`<base>-m.<ext>`). */
  mobile?: boolean;
  /** Crédit affiché discrètement sous l'image. */
  credit?: string;
}

/**
 * Photos publiées. Un emplacement absent d'ici n'affiche pas une image
 * générique : le site n'exhibe jamais une photo « d'ambiance » qui ne serait
 * pas la sienne.
 *
 * `attente-appareils` — la mise en scène du produit sur la page d'attente
 * (montage tablette + téléphone), à droite du texte sur grand écran. Export à
 * fond transparent : le bloc est vert, un JPEG aplatirait le fond en blanc et
 * poserait un rectangle clair sur la page. D'où `formats: ['webp', 'png']` et
 * `fallback: 'png'`.
 *
 * Fichiers dérivés de assets/site-sources/attente-appareils.png (4500 × 3000,
 * recadré sur les appareils) : 1600 px de large, plus la variante `-m` en
 * 800 px pour les petits écrans.
 */
export const PHOTOS: Record<string, PhotoAsset> = {
  'attente-appareils': {
    base: '/site/photos/attente-appareils',
    alt: 'HelloPos affiché sur une tablette et sur un téléphone',
    formats: ['webp', 'png'],
    fallback: 'png',
    mobile: true,
  },
};

export function photo(slot: string): PhotoAsset | undefined {
  return PHOTOS[slot];
}
