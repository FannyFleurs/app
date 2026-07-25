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

type Encoder = import('star-prnt-encoder').default;

// Avance papier de `mm` mm (ESC J n ; n en points de 0,125 mm à 203 dpi).
function feed(enc: Encoder, mm: number): void {
  const dots = Math.min(255, Math.max(0, Math.round(mm / 0.125)));
  if (dots > 0) enc.raw([0x1b, 0x4a, dots]);
}

// Petite avance dans le gap (3 mm) avant la coupe, pour couper au milieu du
// prédécoupé. Ajustable.
const CUT_GAP_MM = 1.5;
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
    // PAS de form feed ici : l'image atteint déjà le bord de l'étiquette (le
    // papier est au gap). Un form feed depuis le gap sauterait une étiquette
    // entière → c'était la vierge du mode image. On avance juste un poil dans
    // le gap, puis on coupe.
    feed(enc, CUT_GAP_MM);
    enc.cut();
  }

  return Buffer.from(enc.encode());
}

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
