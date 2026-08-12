import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print';
import {
  renderSingleLabelBitmap, renderTestLabelBitmap, bitmapToPngBuffer,
} from '@/lib/services/cloudprnt/label-render';

/**
 * Star Document Markup : le document intermédiaire d'un lot d'étiquettes.
 *
 * Une étiquette = une image indépendante. ENTRE deux images, `[feed:
 * black-mark]` demande à l'imprimante d'avancer jusqu'à la marque noire
 * suivante : le recalage est fait par le capteur, à chaque étiquette, donc
 * aucune erreur ne s'additionne. C'est exactement ce que le logiciel ne
 * pouvait pas faire en empilant les étiquettes dans une image au pas calculé.
 *
 * Après la DERNIÈRE image, pas de feed : seulement `[cut]`. Un feed suivi
 * d'une coupe ferait avancer deux fois.
 *
 * Deux détails de syntaxe, vérifiés dans la documentation Star :
 *  - l'URL est mise entre guillemets, sans quoi le `;` de
 *    `data:image/png;base64,…` serait lu comme un séparateur de paramètres ;
 *  - le `\\` en fin de ligne annule le saut de ligne automatique qui suit une
 *    image, sans lequel chaque étiquette gagnerait une ligne blanche.
 */

/** Une image, en Data URL PNG, prête à être posée dans le document. */
async function ligneImage(png: Buffer): Promise<string> {
  return `[image: url "data:image/png;base64,${png.toString('base64')}"]\\`;
}

/** Assemble le document à partir d'images déjà encodées. */
function assembler(images: string[]): string {
  const morceaux: string[] = [];
  images.forEach((img, i) => {
    morceaux.push(img);
    // Entre deux étiquettes seulement : après la dernière, la coupe suffit.
    if (i < images.length - 1) morceaux.push('[feed: black-mark]\\');
  });
  morceaux.push('[cut]');
  return morceaux.join('\n');
}

export async function buildLabelsMarkup(
  flat: LabelProduct[], settings: LabelSettings,
): Promise<string> {
  const images: string[] = [];
  for (const produit of flat) {
    const bmp = await renderSingleLabelBitmap(produit, settings);
    images.push(await ligneImage(await bitmapToPngBuffer(bmp)));
  }
  return assembler(images);
}

/** Même document, avec les étiquettes de réglage numérotées. */
export async function buildTestLabelsMarkup(
  count: number, settings: LabelSettings,
): Promise<string> {
  const images: string[] = [];
  for (let i = 1; i <= count; i++) {
    const bmp = await renderTestLabelBitmap(`TEST ${String(i).padStart(2, '0')}`, settings);
    images.push(await ligneImage(await bitmapToPngBuffer(bmp)));
  }
  return assembler(images);
}
