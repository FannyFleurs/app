import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print-core';
import { computeLabelLayout, type LabelBlock } from '@/lib/services/label-layout';

/**
 * Rendu d'UNE étiquette en BITMAP (canvas serveur pureimage), destiné à être
 * inséré dans un job StarPRNT via `encoder.image(...)`.
 *
 * Une étiquette logique = un bitmap indépendant. Le lot n'est plus empilé dans
 * une image continue : le logiciel ne fabrique plus lui-même le pas entre deux
 * étiquettes, c'est le capteur de marque noire de l'imprimante qui positionne
 * le support. Reconstituer ce pas en pixels ajoutait une erreur qui
 * s'additionnait d'une étiquette à l'autre.
 *
 * Ce fichier ne DÉCIDE pas de la mise en page : il transpose en pixels les
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
 * Encode un bitmap RGBA en PNG, en mémoire.
 *
 * Star Document Markup embarque les images en Data URL : il faut donc un PNG,
 * pas un tableau de pixels. Rien n'est écrit sur disque — la fonction tourne
 * dans une lambda Vercel, dont le seul répertoire inscriptible est /tmp et
 * qu'on garde pour le fichier .stm.
 */
export async function bitmapToPngBuffer(bmp: LabelBitmap): Promise<Buffer> {
  await ensureDeps();
  const PImage = PImageMod;
  const img = PImage.make(bmp.width, bmp.height);
  (img as { data: Uint8Array }).data.set(bmp.data);

  const morceaux: Buffer[] = [];
  const flux = new PassThrough();
  flux.on('data', (c: Buffer) => morceaux.push(c));
  await PImage.encodePNGToStream(img, flux);
  return Buffer.concat(morceaux);
}

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
  const layout = computeLabelLayout(p, s, s.print_offset_y_mm ?? 0);
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

/** Largeur du raster : multiple de 8 points, contrainte du format Star. */
function largeurRaster(s: LabelSettings): number {
  const W = Math.round((s.width_mm || 51) * DPMM);
  return Math.max(64, Math.round(W / 8) * 8);
}

/**
 * Rend UNE étiquette, à la hauteur imprimable demandée par l'appelant.
 *
 * La hauteur passée ici est la hauteur RÉELLEMENT encrée, pas le pas du
 * support : le pas appartient au média et au capteur de marque noire, il n'a
 * plus aucune existence dans le bitmap.
 */
export async function renderSingleLabelBitmap(
  label: LabelProduct, s: LabelSettings,
): Promise<LabelBitmap> {
  await ensureDeps();
  const PImage = PImageMod;

  const W = largeurRaster(s);
  const H = Math.max(80, Math.round((s.height_mm || 23) * DPMM));

  const img = PImage.make(W, H);
  const ctx = img.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  await drawLabel(ctx, W, 0, H, label, s);

  return { data: img.data as Uint8Array, width: W, height: H };
}

/**
 * Étiquette de RÉGLAGE : un filet en haut, un filet en bas, un texte centré,
 * aucun code-barres.
 *
 * Elle sert à mesurer la dérive : si la vingtième sort au même endroit que la
 * première, le pas est bon. Les filets donnent le repère — un texte seul se
 * juge mal à un millimètre près.
 */
export async function renderTestLabelBitmap(
  texte: string, s: LabelSettings,
): Promise<LabelBitmap> {
  await ensureDeps();
  const PImage = PImageMod;

  const W = largeurRaster(s);
  const H = Math.max(80, Math.round((s.height_mm || 23) * DPMM));

  const img = PImage.make(W, H);
  const ctx = img.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  const marge = Math.round(1.5 * DPMM);   // filets à 1,5 mm des bords
  const epaisseur = Math.max(2, Math.round(0.4 * DPMM));
  ctx.fillStyle = '#000000';
  ctx.fillRect(marge, marge, W - marge * 2, epaisseur);
  ctx.fillRect(marge, H - marge - epaisseur, W - marge * 2, epaisseur);

  const fontPx = Math.round(H * 0.34);
  drawCenteredLine(ctx, texte, marge, W - marge * 2, Math.round(H / 2 + fontPx * CAP_RATIO / 2), fontPx, true);

  return { data: img.data as Uint8Array, width: W, height: H };
}
