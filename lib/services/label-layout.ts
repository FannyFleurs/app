import { formatEUR } from './money';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct, discountedPrice } from './label-print-core';

/**
 * Mise en page d'une étiquette produit, exprimée EN MILLIMÈTRES.
 *
 * Un seul calcul sert les trois rendus — bitmap thermique, repli HTML/PDF et
 * aperçu du paramétrage — pour que ce qu'on voit à l'écran soit ce qui sort de
 * l'imprimante. Les rendus ne font que transposer des millimètres dans leur
 * unité ; ils ne décident plus de rien.
 *
 * Pourquoi un moteur en millimètres plutôt que des positions libres : la
 * disposition précédente plaçait chaque élément à une fraction de l'étiquette,
 * avec une taille de police mise à l'échelle d'une hauteur de référence fixe.
 * Trois conséquences, toutes constatées à l'impression :
 *   — changer de format divisait les polices sans changer les positions, d'où
 *     un rendu minuscule perdu au milieu de l'étiquette ;
 *   — un texte posé à un point n'a pas de largeur disponible, donc pas de
 *     retour à la ligne possible : les noms longs étaient coupés à 22
 *     caractères et suffixés « … » ;
 *   — rien ne garantissait qu'un élément reste dans les bords.
 *
 * Ici, les blocs sont empilés du haut vers le bas dans des bandes proportion-
 * nelles à la hauteur réellement disponible. Tout est relatif au format : une
 * étiquette deux fois plus petite donne le même dessin, deux fois plus petit.
 */

/**
 * Marge minimale, en mm, en haut et sur les côtés.
 *
 * Volontairement serrée : sur une étiquette de quelques centimètres, chaque
 * millimètre rendu au contenu est du texte plus gros. Le bord de fuite, lui,
 * a sa propre marge (MIN_BOTTOM_MM) — c'est le seul qui court un risque.
 */
const MIN_MARGIN_MM = 1.2;

/**
 * Marge BASSE minimale, nettement plus généreuse.
 *
 * L'entraînement du média se fait vers le bas : toute erreur de calage se
 * cumule donc sur le bord de fuite, et c'est là — et seulement là — que le
 * contenu se fait rogner. Constaté sur étiquettes imprimées : les chiffres du
 * code-barres, dernier élément posé, disparaissaient alors que l'image envoyée
 * les contenait bien, à 2 mm du bord. On leur donne de quoi encaisser le
 * décalage plutôt que de compter sur un calage parfait.
 */
const MIN_BOTTOM_MM = 3;

/**
 * Hauteur de police minimale (em) sous laquelle une imprimante thermique
 * 203 dpi ne rend plus rien de lisible. On préfère tronquer un nom trop long
 * plutôt que d'imprimer du gris illisible.
 */
const MIN_FONT_MM = 1.9;

/** Interligne, en multiples de la taille de police. */
const LINE_HEIGHT = 1.12;

/** Nombre maximal de lignes pour le nom de l'article. */
const NAME_MAX_LINES = 3;

export type LabelBlockKind =
  | 'name' | 'sku' | 'price-old' | 'price' | 'barcode' | 'barcode-text';

export interface LabelBlock {
  kind: LabelBlockKind;
  /** Lignes de texte déjà découpées (vide pour le code-barres). */
  lines: string[];
  /** Boîte du bloc, en mm, depuis le coin haut-gauche de l'étiquette. */
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  /** Taille de police (em) en mm. Zéro pour le code-barres. */
  fontMm: number;
  bold: boolean;
  /** Barré : ancien prix d'un article remisé. */
  strike?: boolean;
}

export interface LabelLayoutResult {
  widthMm: number;
  heightMm: number;
  /** Marge haute et latérale. */
  marginMm: number;
  /** Marge basse — volontairement plus large (cf. MIN_BOTTOM_MM). */
  marginBottomMm: number;
  blocks: LabelBlock[];
}

/* --------------------------------------------------------------- mesures */

/**
 * Largeur estimée d'un texte, en mm, pour une police donnée.
 *
 * Estimation volontairement indépendante du moteur de rendu : c'est la seule
 * façon d'obtenir le MÊME découpage de lignes côté serveur (canvas), côté
 * navigateur (aperçu) et dans le repli HTML. Les rendus qui savent mesurer
 * précisément resserrent ensuite si besoin ; ils ne réélargissent jamais.
 */
export function estimateWidthMm(text: string, fontMm: number, bold: boolean): number {
  let em = 0;
  for (const ch of text) {
    if ('iljt.,;:\'!|[]()/ '.includes(ch)) em += 0.30;
    else if ('mwMW@'.includes(ch)) em += 0.86;
    else if (ch >= '0' && ch <= '9') em += 0.58;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) em += 0.66;
    else em += 0.53;
  }
  return em * fontMm * (bold ? 1.04 : 1);
}

/**
 * Découpe un texte en au plus `maxLines` lignes tenant dans `maxWidthMm`.
 * Renvoie null si ça ne tient pas — l'appelant réduit alors la police.
 */
function wrap(text: string, fontMm: number, bold: boolean, maxWidthMm: number, maxLines: number): string[] | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let cur = '';

  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (estimateWidthMm(candidate, fontMm, bold) <= maxWidthMm) { cur = candidate; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    if (lines.length >= maxLines) return null;
    // Mot seul plus large que la ligne (référence collée, nom sans espace) :
    // on le coupe caractère par caractère plutôt que de déborder.
    if (estimateWidthMm(word, fontMm, bold) > maxWidthMm) {
      let chunk = '';
      for (const ch of word) {
        if (estimateWidthMm(chunk + ch, fontMm, bold) > maxWidthMm && chunk) {
          lines.push(chunk);
          if (lines.length >= maxLines) return null;
          chunk = ch;
        } else chunk += ch;
      }
      cur = chunk;
    } else cur = word;
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/**
 * Plus grande police tenant dans la boîte, et les lignes correspondantes.
 * On part du plafond et on descend par pas fins : la recherche est bornée et
 * donne le même résultat partout, ce qu'une dichotomie flottante ne garantit
 * pas d'un moteur à l'autre.
 */
function fitText(
  text: string, maxWidthMm: number, maxHeightMm: number, bold: boolean, maxLines: number, ceilingMm: number,
): { lines: string[]; fontMm: number } {
  for (let f = ceilingMm; f >= MIN_FONT_MM; f -= 0.05) {
    const linesAllowed = Math.max(1, Math.min(maxLines, Math.floor(maxHeightMm / (f * LINE_HEIGHT))));
    const lines = wrap(text, f, bold, maxWidthMm, linesAllowed);
    if (lines && lines.length * f * LINE_HEIGHT <= maxHeightMm + 0.01) {
      return { lines, fontMm: Math.round(f * 100) / 100 };
    }
  }
  // Plancher atteint : on tronque proprement plutôt que de déborder.
  const f = MIN_FONT_MM;
  const linesAllowed = Math.max(1, Math.min(maxLines, Math.floor(maxHeightMm / (f * LINE_HEIGHT))));
  const lines = wrap(text, f, bold, maxWidthMm, linesAllowed) ?? [];
  if (lines.length) return { lines, fontMm: f };
  // Dernier recours : une ligne coupée à la largeur disponible.
  let cut = '';
  for (const ch of text) {
    if (estimateWidthMm(`${cut}${ch}…`, f, bold) > maxWidthMm) break;
    cut += ch;
  }
  return { lines: [cut ? `${cut}…` : '…'], fontMm: f };
}

/* ------------------------------------------------------------ composition */

/** Poids de chaque bande dans la hauteur disponible. */
const WEIGHTS = { name: 1.00, sku: 0.30, price: 1.30, barcode: 1.20 };

/**
 * @param shiftMm Compensation du calage de l'imprimante, en mm (négatif =
 *   remonte le contenu). Elle n'est PAS une translation : on ne peut pas
 *   pousser du contenu au-dessus du bord de l'image, ça le rognerait. On
 *   resserre donc la marge haute d'autant et on rend la place à la marge
 *   basse — le contenu se tasse vers le haut et, une fois posé plus bas par
 *   la machine, retombe au bon endroit sur l'étiquette.
 *   Réservé au rendu thermique : l'aperçu montre la mise en page cible.
 */
export function computeLabelLayout(p: LabelProduct, s: LabelSettings, shiftMm = 0): LabelLayoutResult {
  const W = Math.max(10, s.width_mm || 50);
  const H = Math.max(10, s.height_mm || 30);
  // Marge proportionnelle, jamais sous le seuil de sécurité : elle absorbe la
  // dérive d'entraînement du média, qui décale l'impression de quelques
  // dixièmes de millimètre d'une étiquette à l'autre.
  const baseMargin = Math.max(MIN_MARGIN_MM, Math.min(W, H) * 0.03);
  const baseBottom = Math.max(MIN_BOTTOM_MM, H * 0.09);
  // Le calage se traduit en marges : ce qu'on retire en haut, on l'ajoute en
  // bas. Un filet de 0,4 mm reste réservé en haut — coller le texte au bord
  // n'apporte rien et le premier dixième de millimètre est rarement net.
  const margin = Math.max(0.4, baseMargin + shiftMm);
  const marginBottom = Math.max(MIN_BOTTOM_MM, baseBottom - shiftMm);
  const usableW = Math.max(4, W - baseMargin * 2);
  const usableH = Math.max(4, H - margin - marginBottom);

  const hasName = !!(s.show_name && p.name);
  const hasSku = !!(s.show_sku && p.sku);
  const hasPrice = !!s.show_price;
  const disc = hasPrice && s.show_discount ? discountedPrice(p) : null;
  const hasBarcode = !!(s.show_barcode && p.barcode);

  // Répartition de la hauteur, bloc après bloc et de haut en bas : à chaque
  // étape, la hauteur RESTANTE est partagée entre les blocs qui restent, au
  // prorata de leur poids. Un bloc qui consomme moins que sa part — un nom
  // court qui tient sur une ligne — rend le reste aux suivants au lieu de
  // laisser un blanc au milieu de l'étiquette. Un bloc masqué rend toute sa
  // part de la même façon.
  const present: Array<keyof typeof WEIGHTS> = [];
  if (hasName) present.push('name');
  if (hasSku) present.push('sku');
  if (hasPrice) present.push('price');
  if (hasBarcode) present.push('barcode');

  let restH = usableH;
  let restWeight = present.reduce((t, k) => t + WEIGHTS[k], 0) || 1;
  /** Part du bloc courant, puis retrait de son poids du pot commun. */
  const takeBand = (k: keyof typeof WEIGHTS) => {
    const share = (WEIGHTS[k] / restWeight) * restH;
    restWeight -= WEIGHTS[k];
    return share;
  };
  /** Ce que le bloc a réellement consommé — le reste profite aux suivants. */
  const consume = (used: number) => { restH = Math.max(0, restH - used); };

  // Facteur d'emphase par élément, réglable dans le paramétrage. Borné : il
  // module la hiérarchie, il ne doit pas pouvoir faire déborder un bloc.
  const xLeft = baseMargin;
  const emph = (k: 'name' | 'price' | 'barcode' | 'sku') =>
    Math.min(1.8, Math.max(0.5, s.layout?.[k]?.size ?? 1));

  const blocks: LabelBlock[] = [];
  let y = margin;

  /* --- Nom, en haut : c'est ce qu'on lit en premier sur un rayon. --- */
  if (hasName) {
    const h = takeBand('name');
    const fit = fitText(p.name, usableW, h, true, NAME_MAX_LINES, Math.min(h, usableH * 0.30) * emph('name'));
    const used = fit.lines.length * fit.fontMm * LINE_HEIGHT;
    blocks.push({
      kind: 'name', lines: fit.lines,
      xMm: xLeft, yMm: y, wMm: usableW, hMm: used,
      fontMm: fit.fontMm, bold: true,
    });
    // Une respiration sous le nom, proportionnelle à sa taille : sans elle il
    // colle au bloc suivant dès que le reste de l'étiquette est généreux.
    const spaced = Math.min(h, used + fit.fontMm * 0.35);
    y += spaced;
    consume(spaced);
  }

  if (hasSku) {
    const h = takeBand('sku');
    const fit = fitText(p.sku!, usableW, h, false, 1, Math.min(h, usableH * 0.11) * emph('sku'));
    const lineH = fit.fontMm * LINE_HEIGHT;
    // Jamais moins que la ligne elle-même : sur une petite étiquette la bande
    // peut être plus courte que le texte au plancher de lisibilité, et le bloc
    // suivant démarrerait dans la référence.
    const used = Math.max(lineH, Math.min(h, lineH * 1.2));
    blocks.push({
      kind: 'sku', lines: fit.lines,
      xMm: xLeft, yMm: y, wMm: usableW, hMm: fit.fontMm * LINE_HEIGHT,
      fontMm: fit.fontMm, bold: false,
    });
    y += used;
    consume(used);
  }

  /* --- Bande basse : code-barres à GAUCHE, prix à DROITE (sur une même
     ligne). Le nom reste en haut pleine largeur. Si un seul des deux est
     présent, il occupe toute la largeur (centré), comme avant. --- */
  if (hasPrice || hasBarcode) {
    const bandY = y;
    const bandH = restH;                         // tout le reste de la hauteur
    const twoCols = hasPrice && hasBarcode;
    const gap = twoCols ? Math.min(2, usableW * 0.05) : 0;
    // Le symbole (que la douchette cherche) garde la plus grande part.
    const priceColW = twoCols ? usableW * 0.36 : usableW;
    const barcodeColW = twoCols ? usableW - priceColW - gap : usableW;
    const barcodeColX = xLeft;
    const priceColX = twoCols ? xLeft + barcodeColW + gap : xLeft;

    /* Code-barres (colonne gauche), centré verticalement dans la bande. */
    if (hasBarcode) {
      // Les chiffres sous les barres appartiennent au symbole : on leur réserve
      // leur place ici plutôt que de laisser le générateur rogner les barres.
      const digitsMm = Math.min(2.4, Math.max(1.5, bandH * 0.22));
      const barsH = Math.max(3, bandH - digitsMm * 1.25 - 0.3);
      const barsW = Math.min(barcodeColW, barcodeColW * emph('barcode'));
      const used = barsH + digitsMm * 1.25;
      blocks.push({
        kind: 'barcode', lines: [],
        xMm: barcodeColX + (barcodeColW - barsW) / 2,
        yMm: bandY + Math.max(0, (bandH - used) / 2),
        wMm: barsW, hMm: barsH, fontMm: digitsMm, bold: false,
      });
    }

    /* Prix (colonne droite), centré verticalement dans la bande. La largeur de
       colonne borne la taille : fitText réduit la police pour tenir. */
    if (hasPrice) {
      const text = formatEUR(disc ?? p.sale_price_ttc);
      const mainCap = Math.min(bandH * 0.6, usableH * 0.42) * emph('price');
      const fit = fitText(text, priceColW, bandH, true, 1, mainCap);
      const mainUsed = fit.fontMm * LINE_HEIGHT;
      let oldFit: ReturnType<typeof fitText> | null = null;
      let oldUsed = 0;
      if (disc != null) {
        oldFit = fitText(
          formatEUR(p.sale_price_ttc), priceColW, bandH * 0.3, false, 1,
          Math.min(bandH * 0.22, usableH * 0.11),
        );
        oldUsed = oldFit.fontMm * LINE_HEIGHT;
      }
      const groupTop = bandY + Math.max(0, (bandH - (mainUsed + oldUsed)) / 2);
      if (oldFit) {
        blocks.push({
          kind: 'price-old', lines: oldFit.lines,
          xMm: priceColX, yMm: groupTop, wMm: priceColW, hMm: oldUsed,
          fontMm: oldFit.fontMm, bold: false, strike: true,
        });
      }
      blocks.push({
        kind: 'price', lines: fit.lines,
        xMm: priceColX, yMm: groupTop + oldUsed, wMm: priceColW, hMm: mainUsed,
        fontMm: fit.fontMm, bold: true,
      });
    }
    y += bandH;
  }

  return { widthMm: W, heightMm: H, marginMm: margin, marginBottomMm: marginBottom, blocks };
}

/**
 * Paramètres à passer à `ean13Svg` pour que le symbole ait exactement le
 * rapport largeur/hauteur de son bloc.
 *
 * Sans ça, le SVG conserve son propre rapport et se contente de « tenir »
 * dans la boîte : sur une étiquette large, les barres n'occupaient que le
 * milieu, alors que le rendu thermique remplissait toute la largeur. Les deux
 * sorties ne se ressemblaient plus.
 */
export function barcodeSvgSize(b: LabelBlock): { module: number; height: number } {
  const module = 2;
  const svgW = 117 * module;      // 95 modules de données + 2 × 11 de marge
  const textH = 14;               // hauteur réservée aux chiffres par ean13Svg
  const totalMm = b.hMm + b.fontMm * 1.25;
  const height = Math.max(8, Math.round(svgW * (totalMm / Math.max(1, b.wMm))) - textH);
  return { module, height };
}
