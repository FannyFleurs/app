import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print';
import { renderLabelBitmap } from '@/lib/services/cloudprnt/label-render';

/**
 * Génère un job StarPRNT (`application/vnd.star.starprnt`) où chaque étiquette
 * est une IMAGE bitmap (placement 2D précis : nom centré, prix au centre,
 * code-barres en bas) insérée via `encoder.image(...)`, suivie de sa coupe.
 *
 * Pourquoi image + StarPRNT : la mC-Label3 ne gère pas le Star Document Markup,
 * et le mode texte StarPRNT ne sait ni centrer le texte agrandi ni positionner
 * des blocs. L'image règle la mise en page ; le wrapper StarPRNT garde la coupe
 * au bon endroit (contrairement à l'image/png brut).
 */

export const STARPRNT_CONTENT_TYPE = 'application/vnd.star.starprnt';

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

  // UNE étiquette, UNE coupe. Le lot partait auparavant en une seule image
  // continue, au pas calculé par le logiciel : à la troisième étiquette le
  // décalage se voyait, et la coupe tombait là où l'image finissait — trop
  // tôt. L'imprimante, elle, lit la marque noire et sait où couper : on lui
  // rend ce travail plutôt que de le refaire à sa place.
  for (const label of flat) {
    const bmp = await renderLabelBitmap(label, settings);
    enc.image(
      { data: bmp.data, width: bmp.width, height: bmp.height },
      bmp.width,
      bmp.height,
      'threshold',
    );
    enc.cut();
  }

  return Buffer.from(enc.encode());
}

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
