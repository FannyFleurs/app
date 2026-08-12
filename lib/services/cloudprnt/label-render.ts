import path from 'node:path';
import { Readable } from 'node:stream';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print-core';
import { computeLabelLayout, type LabelBlock } from '@/lib/services/label-layout';

/**
 * Rendu des étiquettes en BITMAP (canvas serveur pureimage), destiné à être
 * inséré dans un job StarPRNT via `encoder.image(...)`.
 *
 * Un LOT entier est rendu dans UNE seule image continue : chaque étiquette
 * occupe une « case » au pas physique du média (hauteur étiquette + gap
 * prédécoupé). Aucune commande (feed/coupe) n'est insérée ENTRE les étiquettes
 * → elles s'enchaînent sans vierge intercalaire.
 *
 * Ce fichier ne DÉCIDE plus de la mise en page : il transpose en pixels les
 * blocs calculés en millimètres par `label-layout`. Le même calcul sert
 * l'aperçu à l'écran et le repli HTML, de sorte que les trois rendus
 * s'accordent.
 */

const DPMM = 8;        // 203 dpi ≈ 8 points/mm

/** Hauteur de capitale d'une police, en fraction de sa taille em. */
const CAP_RATIO = 0.72;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PImageMod: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bwip: any = null;
let fontsReady = false;

async function ensureDeps() {
  if (!PImageMod) PImageMod = await import('pureimage');
  if (!bwip) { const m = await import('bwip-js/node'); bwip = m.default ?? m; }
  if (!fontsReady) {
    const dir = path.join(process.cwd(), 'assets', 'fonts');
    // Arimo : métriques identiques à Arial, licence Apache 2.0.
    // La police précédente (Bricolage Grotesque) laissait des entailles
    // BLANCHES là où les tracés d'une lettre se recouvrent — le rastériseur
    // remplit ces zones en règle pair/impair. Visible à l'œil nu sur les
    // étiquettes imprimées, et sans rapport avec la mise en page.
    PImageMod.registerFont(path.join(dir, 'Arimo-Bold.ttf'), 'LabelBold').loadSync();
    PImageMod.registerFont(path.join(dir, 'Arimo-Regular.ttf'), 'LabelReg').loadSync();
    fontsReady = true;
  }
}

export interface LabelBitmap { data: Uint8Array; width: number; height: number; }

/**
 * Trace une ligne centrée dans la boîte, en resserrant la police si la mesure
 * réelle dépasse l'estimation du moteur de mise en page. On ne réélargit
 * jamais : la boîte fait foi, quitte à imprimer un poil plus petit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCenteredLine(ctx: any, text: string, boxXpx: number, boxWpx: number, baselineY: number, fontPx: number, bold: boolean): number {
  const family = bold ? 'LabelBold' : 'LabelReg';
  let px = fontPx;
  ctx.font = `${Math.round(px)}px ${family}`;
  let w = ctx.measureText(text).width;
  if (w > boxWpx && w > 0) {
    px = Math.max(6, Math.floor(px * (boxWpx / w)));
    ctx.font = `${Math.round(px)}px ${family}`;
    w = ctx.measureText(text).width;
  }
  ctx.fillText(text, Math.round(boxXpx + (boxWpx - w) / 2), Math.round(baselineY));
  return w;
}

/** Dessine le contenu d'UNE étiquette dans la case [offsetY, offsetY+contentH]. */
async function drawLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any, W: number, offsetY: number, contentH: number, p: LabelProduct, s: LabelSettings,
) {
  // Le calage de l'imprimante entre dans le CALCUL de la mise en page, pas
  // dans un décalage de pixels : translater l'image rognerait le haut, alors
  // que resserrer les marges tasse le contenu sans rien perdre.
  const layout = computeLabelLayout(p, s, s.print_offset_y_mm ?? 0, s.print_offset_x_mm ?? 0);
  // Le moteur raisonne sur le format demandé ; la case réellement disponible
  // peut différer d'un pixel ou deux (largeur arrondie au multiple de 8 exigé
  // par le raster). On projette donc plutôt que de supposer.
  const kx = W / (layout.widthMm * DPMM);
  const ky = contentH / (layout.heightMm * DPMM);
  const toPxX = (mm: number) => mm * DPMM * kx;
  const toPxY = (mm: number) => mm * DPMM * ky;

  const top = offsetY;

  ctx.fillStyle = '#000000';

  for (const b of layout.blocks) {
    if (b.kind === 'barcode') {
      await drawBarcode(ctx, b, p, toPxX, toPxY, top);
      continue;
    }
    const fontPx = Math.max(6, Math.round(toPxY(b.fontMm)));
    const lineH = toPxY(b.fontMm * 1.12);
    const boxX = toPxX(b.xMm);
    const boxW = toPxX(b.wMm);
    b.lines.forEach((line, i) => {
      // Ligne de base = haut de la ligne + hauteur de capitale : le texte
      // s'appuie sur le haut de sa boîte, ce qui rend les bandes prévisibles.
      const baseline = top + toPxY(b.yMm) + i * lineH + fontPx * CAP_RATIO;
      const w = drawCenteredLine(ctx, line, boxX, boxW, baseline, fontPx, b.bold);
      if (b.strike) {
        const y = Math.round(baseline - fontPx * CAP_RATIO * 0.42);
        const x0 = Math.round(boxX + (boxW - w) / 2);
        ctx.fillRect(x0, y, Math.round(w), Math.max(1, Math.round(fontPx * 0.07)));
      }
    });
  }
}

/** Code-barres EAN-13 rendu à la taille exacte de son bloc. */
async function drawBarcode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any, b: LabelBlock, p: LabelProduct,
  toPxX: (mm: number) => number, toPxY: (mm: number) => number, offsetY: number,
) {
  const boxX = toPxX(b.xMm);
  const boxW = toPxX(b.wMm);
  const boxY = offsetY + toPxY(b.yMm);
  const barsH = toPxY(b.hMm);
  const digitsPx = Math.max(6, Math.round(toPxY(b.fontMm)));

  if (!p.barcode) return;

  if (!isValidEan13(p.barcode)) {
    // Code non normalisé : on imprime la valeur telle quelle, centrée, plutôt
    // qu'un symbole que rien ne saura relire.
    drawCenteredLine(ctx, p.barcode, boxX, boxW, boxY + barsH * 0.6, Math.round(barsH * 0.5), false);
    return;
  }

  // Conversion d'unités, sans laquelle rien ne tombe juste : bwip travaille en
  // base 72 dpi, `scale` étant le nombre de pixels par module, `height` la
  // hauteur des barres en MILLIMÈTRES et `textsize` la taille des chiffres en
  // POINTS. Une hauteur passée en pixels donnait des chiffres démesurés qui
  // chevauchaient les barres.
  const BWIP_PX_PER_MM = 72 / 25.4;
  // Un EAN-13 fait 113 modules de large, marges de silence comprises.
  const modulePx = Math.max(1, Math.floor(boxW / 113));
  const bcPng: Buffer = await bwip.toBuffer({
    bcid: 'ean13', text: p.barcode,
    scale: modulePx,
    height: Math.max(2, barsH / (modulePx * BWIP_PX_PER_MM)),
    includetext: true,
    textsize: Math.max(4, Math.round(digitsPx / modulePx)),
    backgroundcolor: 'FFFFFF',
  });
  const bcImg = await PImageMod.decodePNGFromStream(Readable.from(bcPng));

  // Ajustement final à la boîte : jamais plus large, jamais plus haut.
  const maxH = barsH + toPxY(b.fontMm * 1.25);
  let w = bcImg.width;
  let h = bcImg.height;
  const r = Math.min(boxW / w, maxH / h, 1);
  w = Math.round(w * r);
  h = Math.round(h * r);
  ctx.drawImage(bcImg, Math.round(boxX + (boxW - w) / 2), Math.round(boxY), w, h);
}

/**
 * Rend un « feuillet » : plusieurs étiquettes empilées dans UNE image continue
 * (chacune dans une case au pas étiquette+gap). Une seule image = un seul
 * enc.image() → aucune séparation entre étiquettes.
 */
export async function renderLabelSheetBitmap(labels: LabelProduct[], s: LabelSettings): Promise<LabelBitmap> {
  await ensureDeps();
  const PImage = PImageMod;

  let W = Math.round((s.width_mm || 51) * DPMM);
  W = Math.max(64, Math.round(W / 8) * 8); // largeur multiple de 8 (raster)
  const contentH = Math.max(80, Math.round((s.height_mm || 51) * DPMM));
  // L'écart vient des réglages : il valait 3 mm en dur, ce qui n'a de sens
  // que pour le rouleau prédécoupé d'origine. Sur un papier à marque noire,
  // le pas est la hauteur d'étiquette (écart 0) — et 3 mm de trop par
  // étiquette faisaient dériver le lot entier.
  const gapPx = Math.round((s.gap_mm ?? 3) * DPMM);
  const pitch = contentH + gapPx;
  // Réglage fin de la position de coupe : on raccourcit légèrement l'image en
  // fin de lot pour remonter la coupe (la coupe tombait ~2 mm trop loin).
  const CUT_TRIM_MM = 0;
  const trimPx = Math.round(CUT_TRIM_MM * DPMM);
  const H = Math.max(contentH - trimPx, pitch * labels.length - gapPx - trimPx);

  const img = PImage.make(W, Math.max(contentH, H));
  const ctx = img.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, Math.max(contentH, H));

  for (let i = 0; i < labels.length; i++) {
    await drawLabel(ctx, W, i * pitch, contentH, labels[i]!, s);
  }

  return { data: img.data as Uint8Array, width: W, height: Math.max(contentH, H) };
}
