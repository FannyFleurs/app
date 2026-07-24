import path from 'node:path';
import { Readable } from 'node:stream';
import { formatEUR } from '@/lib/services/money';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct, discountedPrice } from '@/lib/services/label-print';

/**
 * Rendu d'une étiquette en BITMAP (canvas serveur pureimage), destiné à être
 * inséré dans un job StarPRNT via `encoder.image(...)`. Permet un placement 2D
 * précis (nom centré en haut, prix centré au milieu, code-barres en bas) — ce
 * que le mode texte StarPRNT ne sait pas faire — tout en conservant la coupe
 * propre (form feed + gap) gérée côté commandes.
 */

const DPMM = 8; // 203 dpi ≈ 8 points/mm

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

/** Rend une étiquette en bitmap RGBA (largeur multiple de 8 pour StarPRNT). */
export async function renderLabelBitmap(p: LabelProduct, s: LabelSettings): Promise<LabelBitmap> {
  await ensureDeps();
  const PImage = PImageMod;

  // Largeur alignée sur 8 px (packing raster StarPRNT).
  let W = Math.round((s.width_mm || 51) * DPMM);
  W = Math.max(64, Math.round(W / 8) * 8);
  const H = Math.max(80, Math.round((s.height_mm || 51) * DPMM));
  const scale = H / 408;

  const img = PImage.make(W, H);
  const ctx = img.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';

  const centerText = (text: string, pt: number, bold: boolean, baseline: number) => {
    ctx.font = `${pt}pt ${bold ? 'LabelBold' : 'LabelReg'}`;
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, Math.max(0, (W - tw) / 2), baseline);
  };

  // --- HAUT : nom (gros) ---
  if (s.show_name && p.name) {
    const name = p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name;
    centerText(name, Math.round(30 * scale), true, Math.round(60 * scale));
  }
  if (s.show_sku && p.sku) {
    centerText(p.sku, Math.round(13 * scale), false, Math.round(92 * scale));
  }

  // --- CENTRE : prix (très gros) ---
  if (s.show_price) {
    const disc = s.show_discount ? discountedPrice(p) : null;
    if (disc != null) {
      centerText(`au lieu de ${formatEUR(p.sale_price_ttc)}`, Math.round(15 * scale), false, Math.round(175 * scale));
      centerText(formatEUR(disc), Math.round(58 * scale), true, Math.round(240 * scale));
    } else {
      centerText(formatEUR(p.sale_price_ttc), Math.round(60 * scale), true, Math.round(230 * scale));
    }
  }

  // --- BAS : code-barres + EAN collés ---
  if (s.show_barcode && p.barcode) {
    if (isValidEan13(p.barcode)) {
      const bcPng: Buffer = await bwip.toBuffer({
        bcid: 'ean13',
        text: p.barcode,
        scale: Math.max(2, Math.round(3 * scale)),
        height: Math.round(13 * scale),
        includetext: true,
        textsize: Math.round(11 * scale),
        backgroundcolor: 'FFFFFF',
      });
      const bcImg = await PImage.decodePNGFromStream(Readable.from(bcPng));
      const maxW = Math.round(W * 0.9);
      let w = bcImg.width; let h = bcImg.height;
      if (w > maxW) { const r = maxW / w; w = maxW; h = Math.round(h * r); }
      ctx.drawImage(bcImg, Math.round((W - w) / 2), H - h - Math.round(12 * scale), w, h);
    } else {
      centerText(p.barcode, Math.round(16 * scale), false, H - Math.round(18 * scale));
    }
  }

  return { data: img.data as Uint8Array, width: W, height: H };
}
