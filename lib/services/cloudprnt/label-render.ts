import path from 'node:path';
import { Readable } from 'node:stream';
import { formatEUR } from '@/lib/services/money';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct, discountedPrice } from '@/lib/services/label-print';

/**
 * Rendu des étiquettes en BITMAP (canvas serveur pureimage), destiné à être
 * inséré dans un job StarPRNT via `encoder.image(...)`.
 *
 * Un LOT entier est rendu dans UNE seule image continue : chaque étiquette
 * occupe une « case » au pas physique du média (hauteur étiquette + gap
 * prédécoupé). Aucune commande (feed/coupe) n'est insérée ENTRE les étiquettes
 * → elles s'enchaînent sans vierge intercalaire. Placement 2D précis (nom
 * centré en haut, prix au centre, code-barres en bas).
 */

const DPMM = 8;        // 203 dpi ≈ 8 points/mm
const GAP_MM = 3;      // gap prédécoupé entre étiquettes (Fanny Fleurs : 3 mm)

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
    PImageMod.registerFont(path.join(dir, 'BricolageGrotesque-Bold.ttf'), 'LabelBold').loadSync();
    PImageMod.registerFont(path.join(dir, 'BricolageGrotesque-Regular.ttf'), 'LabelReg').loadSync();
    fontsReady = true;
  }
}

export interface LabelBitmap { data: Uint8Array; width: number; height: number; }

/** Dessine le contenu d'UNE étiquette dans la case [offsetY, offsetY+contentH]. */
async function drawLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any, W: number, offsetY: number, contentH: number, p: LabelProduct, s: LabelSettings,
) {
  const scale = contentH / 408;
  const L = s.layout;
  ctx.fillStyle = '#000000';

  // Dessine un texte CENTRÉ au point (cx, cy) fourni en fraction de l'étiquette.
  const cTextAt = (text: string, basePt: number, bold: boolean, el: { x: number; y: number; size: number }) => {
    const pt = Math.max(6, Math.round(basePt * el.size * scale));
    ctx.font = `${pt}pt ${bold ? 'LabelBold' : 'LabelReg'}`;
    const tw = ctx.measureText(text).width;
    const cx = el.x * W;
    const cy = offsetY + el.y * contentH;
    // baseline ≈ centre vertical + demi-hauteur de capitale.
    ctx.fillText(text, Math.max(0, cx - tw / 2), Math.round(cy + pt * 0.5));
  };

  if (s.show_name && p.name) {
    const name = p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name;
    cTextAt(name, 30, true, L.name);
  }
  if (s.show_sku && p.sku) {
    cTextAt(p.sku, 13, false, L.sku);
  }

  if (s.show_price) {
    const disc = s.show_discount ? discountedPrice(p) : null;
    if (disc != null) {
      cTextAt(`au lieu de ${formatEUR(p.sale_price_ttc)}`, 15, false, { ...L.price, y: Math.max(0, L.price.y - 0.09) });
      cTextAt(formatEUR(disc), 54, true, L.price);
    } else {
      cTextAt(formatEUR(p.sale_price_ttc), 56, true, L.price);
    }
  }

  if (s.show_barcode && p.barcode) {
    if (isValidEan13(p.barcode)) {
      const bcPng: Buffer = await bwip.toBuffer({
        bcid: 'ean13', text: p.barcode,
        scale: Math.max(2, Math.round(2 * L.barcode.size * scale)),
        height: Math.round(9 * scale),
        includetext: true, textsize: Math.round(8 * scale),
        backgroundcolor: 'FFFFFF',
      });
      const bcImg = await PImageMod.decodePNGFromStream(Readable.from(bcPng));
      const maxW = Math.round(W * 0.92);
      let w = bcImg.width; let h = bcImg.height;
      if (w > maxW) { const r = maxW / w; w = maxW; h = Math.round(h * r); }
      const cx = L.barcode.x * W;
      const cy = offsetY + L.barcode.y * contentH;
      ctx.drawImage(bcImg, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    } else {
      cTextAt(p.barcode, 16, false, L.barcode);
    }
  }
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
  const gapPx = Math.round(GAP_MM * DPMM);
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
