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
  return `[image: url "data:image/png;base64,${png.toString('base64')}"]`;
}

/**
 * Assemble les directives en document.
 *
 * Chaque ligne SAUF la dernière reçoit le « \ » final : il annule le saut de
 * ligne automatique qui suivrait la directive. Oublié une seule fois, il
 * ajoute une avance d'une ligne — assez pour décaler une étiquette et fausser
 * toute conclusion.
 */
function document(directives: string[]): string {
  return directives
    .map((d, i) => (i < directives.length - 1 ? `${d}\\` : d))
    .join('\n');
}

/** Une étiquette par image, avance sur la marque entre deux, une coupe. */
function assembler(images: string[]): string {
  const directives: string[] = [];
  images.forEach((img, i) => {
    directives.push(img);
    if (i < images.length - 1) directives.push('[feed: black-mark]');
  });
  directives.push('[cut]');
  return document(directives);
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

/* ------------------------------------------------------------------ */
/* Comparatif des enchaînements                                        */
/* ------------------------------------------------------------------ */

/**
 * Ce qui sépare deux étiquettes, et ce qui termine le lot.
 *
 * Les octets produits par CPUtil sont connus et vérifiés :
 *   [feed: black-mark] et [feed: form] → 0C
 *   [cut]                              → 1B 64 03 (avance + coupe)
 *   [cut: nofeed; full]                → 1B 64 00 (coupe sèche)
 *   [cut: feed; full]                  → 1B 64 02
 *
 * Ce qui n'est PAS connu, c'est la géométrie de la machine : distance du
 * capteur à la tête, de la tête au massicot. Elle décide de tout, et aucune
 * documentation ne la donne. D'où ce comparatif : quatre enchaînements
 * imprimés à la suite, marqués A à D, et c'est l'étiquette sortie qui trie.
 */
export const MODES_ENCHAINEMENT = {
  A: { entre: ['[cut]'],                                     libelle: 'coupe après chaque étiquette' },
  B: { entre: ['[feed: black-mark]', '[cut: nofeed; full]'], libelle: 'avance sur la marque puis coupe' },
  C: { entre: ['[feed: black-mark]'],                        libelle: 'avance entre, une seule coupe à la fin' },
  D: { entre: [] as string[],                                libelle: 'rien entre, une seule coupe à la fin' },
};

export type ModeEnchainement = keyof typeof MODES_ENCHAINEMENT;

/**
 * Document de comparaison : deux étiquettes par mode, marquées « A1 A2 »,
 * « B1 B2 »… Une seule impression tranche, au lieu d'un aller-retour par
 * hypothèse.
 */
export async function buildComparatifMarkup(settings: LabelSettings): Promise<string> {
  const directives: string[] = [];
  for (const cle of Object.keys(MODES_ENCHAINEMENT) as ModeEnchainement[]) {
    const mode = MODES_ENCHAINEMENT[cle];
    for (let i = 1; i <= 2; i++) {
      const bmp = await renderTestLabelBitmap(`${cle}${i}`, settings);
      directives.push(await ligneImage(await bitmapToPngBuffer(bmp)));
      // Entre les deux étiquettes du mode : son enchaînement. Après la
      // seconde : la coupe qui clôt le mode, pour que les quatre lots
      // sortent séparés et comparables côte à côte.
      // Après la seconde étiquette : le même enchaînement s'il coupe déjà,
      // sinon une coupe pour séparer ce mode du suivant.
      if (i < 2 || mode.entre.some((d) => d.startsWith('[cut'))) directives.push(...mode.entre);
      else directives.push('[cut]');
    }
  }
  return document(directives);
}

/* ------------------------------------------------------------------ */
/* Expérience : la marque noire établit le top-of-form                 */
/* ------------------------------------------------------------------ */

/**
 * Structure validée au comptoir, pour le lot de test — la production n'y
 * touche pas encore.
 *
 *   [image 1]
 *   [feed: black-mark]   ← amène le papier au début de l'étiquette 2
 *   [image 2]
 *   …
 *   [image N]
 *   [feed: black-mark]   ← amène le papier au bord après la dernière
 *   [cut: nofeed; full]  ← coupe sans chercher à avancer elle-même
 *
 * Aucune avance AVANT la première image : l'imprimante est déjà positionnée
 * sur le premier support au début du job, et un `0x0C` en tête faisait sortir
 * une étiquette vierge. Constaté à l'impression : la série de cinq était
 * juste, mais précédée d'une vierge.
 *
 * L'avance qui suit la DERNIÈRE image est indispensable : elle amène le papier
 * jusqu'à la marque, sans quoi la coupe tombe au milieu de l'étiquette. Et la
 * coupe est en `nofeed` parce que `[cut]` seul (1B 64 03) ne cherche pas la
 * marque : sa petite avance mécanique ne suffit pas.
 *
 * Pour N étiquettes : N rasters, exactement N avances, une seule coupe.
 */
export async function buildTestTopOfFormMarkup(
  count: number, settings: LabelSettings,
): Promise<string> {
  const directives: string[] = [];
  for (let i = 1; i <= count; i++) {
    const bmp = await renderTestLabelBitmap(`TEST ${String(i).padStart(2, '0')}`, settings);
    directives.push(await ligneImage(await bitmapToPngBuffer(bmp)));
    directives.push('[feed: black-mark]');
  }
  directives.push('[cut: nofeed; full]');
  return document(directives);
}
