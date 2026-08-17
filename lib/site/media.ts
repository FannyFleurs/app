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
 *      (idéalement `<slot>.avif`, `<slot>.webp` et `<slot>.jpg`,
 *       en 1600 px de large, plus `<slot>-m.*` en 800 px) ;
 *   2. déclarer l'emplacement ci-dessous avec son texte alternatif.
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
  formats?: ('avif' | 'webp' | 'jpg')[];
  /** Variante 800 px disponible (`<base>-m.<ext>`). */
  mobile?: boolean;
  /** Crédit affiché discrètement sous l'image. */
  credit?: string;
}

/**
 * Photos publiées. Vide tant qu'aucune image n'a été validée : le site
 * n'affiche jamais une photo « d'ambiance » qui ne serait pas la sienne.
 *
 * Emplacement `attente-appareils` — la mise en scène du produit sur la page
 * d'attente (montage tablette + téléphone), à droite du texte sur grand
 * écran. Tant qu'il n'est pas déclaré, c'est l'écran de caisse réel qui
 * s'affiche dans une tablette. Pour le renseigner :
 *
 *   'attente-appareils': {
 *     base: '/site/photos/attente-appareils',
 *     alt: 'HelloPos sur une tablette et un téléphone',
 *     formats: ['webp', 'jpg'],   // ou ['avif', 'webp', 'jpg']
 *     mobile: true,               // si une variante -m existe
 *   },
 *
 * Le fond du bloc étant vert, préférer un export à fond transparent (PNG ou
 * WebP avec alpha) : sur un fond blanc, l'image apparaîtrait comme un
 * rectangle clair posé sur la page.
 */
export const PHOTOS: Record<string, PhotoAsset> = {};

export function photo(slot: string): PhotoAsset | undefined {
  return PHOTOS[slot];
}
