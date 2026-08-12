import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print';
import { renderLabelSheetBitmap } from '@/lib/services/cloudprnt/label-render';

/**
 * Génère un job StarPRNT (`application/vnd.star.starprnt`) où chaque étiquette
 * est une IMAGE bitmap (placement 2D précis : nom centré, prix au centre,
 * code-barres en bas) insérée via `encoder.image(...)`, suivie de la séquence
 * de coupe propre (form feed jusqu'au gap + petite avance + coupe).
 *
 * Pourquoi image + StarPRNT : la mC-Label3 ne gère pas le Star Document Markup,
 * et le mode texte StarPRNT ne sait ni centrer le texte agrandi ni positionner
 * des blocs. L'image règle la mise en page ; le wrapper StarPRNT garde la coupe
 * au bon endroit (contrairement à l'image/png brut).
 */

export const STARPRNT_CONTENT_TYPE = 'application/vnd.star.starprnt';

// Nombre max d'étiquettes par image continue (borne mémoire du bitmap).
const MAX_PER_SHEET = 20;

export async function buildLabelsStarPrnt(
  entries: Array<{ product: LabelProduct; qty: number }>,
  settings: LabelSettings,
): Promise<Buffer> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;
  const enc = new StarPrntEncoder({});
  enc.initialize();

  // Aplatit le lot (article × quantité).
  const flat: LabelProduct[] = [];
  for (const { product, qty } of entries) {
    const n = Math.max(1, Math.min(200, Math.round(qty || 0)));
    for (let i = 0; i < n; i++) flat.push(product);
  }

  // Une seule IMAGE continue par tranche (aucune commande entre les étiquettes
  // → aucune vierge intercalaire). Une seule coupe à la fin de chaque tranche.
  for (let start = 0; start < flat.length; start += MAX_PER_SHEET) {
    const slice = flat.slice(start, start + MAX_PER_SHEET);
    const bmp = await renderLabelSheetBitmap(slice, settings);
    enc.image(
      { data: bmp.data, width: bmp.width, height: bmp.height },
      bmp.width,
      bmp.height,
      'threshold',
    );
    // Coupe directe (sans form feed) : c'est le meilleur état — pas de vierge.
    // (Le form feed avant coupe saute une étiquette → vierge.) La coupe tombe
    // ~5 mm après le gap, offset propre à la coupe « commande » de la mC-Label3
    // que le logiciel ne peut pas compenser (voir note).
    enc.cut();
  }

  return Buffer.from(enc.encode());
}

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
