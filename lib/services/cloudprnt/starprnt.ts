import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print';
import { renderLabelBitmap } from '@/lib/services/cloudprnt/label-render';

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

// Réglage fin de la coupe (avance après le form feed, avant coupe).
const CUT_EXTRA_MM = 1;

export async function buildLabelsStarPrnt(
  entries: Array<{ product: LabelProduct; qty: number }>,
  settings: LabelSettings,
): Promise<Buffer> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;
  const enc = new StarPrntEncoder({});
  enc.initialize();

  const total = countLabels(entries);
  let idx = 0;
  for (const { product, qty } of entries) {
    const n = Math.max(1, Math.min(200, Math.round(qty || 0)));
    const bmp = await renderLabelBitmap(product, settings);
    for (let i = 0; i < n; i++) {
      // Insère l'image (RGBA → monochrome par seuillage, net pour texte/EAN).
      enc.image(
        { data: bmp.data, width: bmp.width, height: bmp.height },
        bmp.width,
        bmp.height,
        'threshold',
      );
      idx += 1;
      if (idx < total) {
        // Étiquette intermédiaire : on avance simplement à l'étiquette suivante
        // (form feed = re-calage sur le gap), SANS couper. Les étiquettes
        // restent enchaînées, séparées par le prédécoupé → aucune vierge entre
        // elles (couper à chaque étiquette éjectait une vierge à chaque fois).
        enc.raw([0x0c]);
      } else {
        // Dernière étiquette du lot : avance au gap puis UNE seule coupe.
        enc.raw([0x0c]);
        feed(enc, CUT_EXTRA_MM);
        enc.cut();
      }
    }
  }

  return Buffer.from(enc.encode());
}

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
