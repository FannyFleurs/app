import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { formatEUR } from '@/lib/services/money';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct, discountedPrice } from '@/lib/services/label-print';

/**
 * Rendu d'une étiquette en IMAGE PNG (`image/png`), format supporté nativement
 * par la mC-Label3. Une image = exactement UNE étiquette : l'imprimante la pose
 * sur une étiquette prédécoupée en partant du haut (top-of-form), ce qui
 * supprime tout débordement d'une étiquette sur la suivante — contrairement au
 * mode « commandes texte » qui glissait sur le média die-cut.
 *
 * Bonus : ce pipeline (canvas serveur) est aussi la base du futur éditeur
 * visuel d'étiquette (placement + taille libres).
 */

const DPMM = 8; // 203 dpi ≈ 8 points/mm

let fontsReady = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PImageMod: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bwip: any = null;

async function ensureDeps(): Promise<void> {
  if (!PImageMod) PImageMod = await import('pureimage');
  if (!bwip) bwip = (await import('bwip-js/node')).default ?? (await import('bwip-js/node'));
  if (!fontsReady) {
    const dir = path.join(process.cwd(), 'assets', 'fonts');
    const bold = PImageMod.registerFont(path.join(dir, 'BricolageGrotesque-Bold.ttf'), 'LabelBold');
    const reg = PImageMod.registerFont(path.join(dir, 'BricolageGrotesque-Regular.ttf'), 'LabelReg');
    bold.loadSync();
    reg.loadSync();
    fontsReady = true;
  }
}

interface Block {
  kind: 'text' | 'image';
  // texte
  text?: string;
  pt?: number;
  bold?: boolean;
  // image (code-barres)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  img?: any;
  w?: number;
  h?: number;
  lineH: number; // hauteur réservée dans le flux
}

/** Génère le PNG d'une étiquette pour un produit. */
export async function renderLabelPng(p: LabelProduct, s: LabelSettings): Promise<Buffer> {
  await ensureDeps();
  const PImage = PImageMod;

  const W = Math.max(120, Math.round((s.width_mm || 51) * DPMM));
  const H = Math.max(120, Math.round((s.height_mm || 51) * DPMM));
  const scale = H / 408; // proportions calées sur une étiquette 51 mm

  const img = PImage.make(W, H);
  const ctx = img.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';

  const blocks: Block[] = [];

  if (s.show_name && p.name) {
    const name = p.name.length > 24 ? `${p.name.slice(0, 23)}…` : p.name;
    const pt = Math.round(26 * scale);
    blocks.push({ kind: 'text', text: name, pt, bold: true, lineH: Math.round(pt * 1.5) });
  }

  if (s.show_sku && p.sku) {
    const pt = Math.round(13 * scale);
    blocks.push({ kind: 'text', text: p.sku, pt, bold: false, lineH: Math.round(pt * 1.5) });
  }

  if (s.show_barcode && p.barcode && isValidEan13(p.barcode)) {
    const bcPng: Buffer = await bwip.toBuffer({
      bcid: 'ean13',
      text: p.barcode,
      scale: Math.max(2, Math.round(3 * scale)),
      height: Math.round(16 * scale),
      includetext: true,
      textsize: Math.round(11 * scale),
      backgroundcolor: 'FFFFFF',
    });
    const bcImg = await PImage.decodePNGFromStream(Readable.from(bcPng));
    // Rétrécit si plus large que l'étiquette (marge 12 %).
    const maxW = Math.round(W * 0.88);
    let w = bcImg.width;
    let h = bcImg.height;
    if (w > maxW) { const r = maxW / w; w = maxW; h = Math.round(h * r); }
    blocks.push({ kind: 'image', img: bcImg, w, h, lineH: h });
  } else if (s.show_barcode && p.barcode) {
    const pt = Math.round(16 * scale);
    blocks.push({ kind: 'text', text: p.barcode, pt, bold: false, lineH: Math.round(pt * 1.5) });
  }

  if (s.show_price) {
    const disc = s.show_discount ? discountedPrice(p) : null;
    if (disc != null) {
      const ptOld = Math.round(15 * scale);
      blocks.push({ kind: 'text', text: `au lieu de ${formatEUR(p.sale_price_ttc)}`, pt: ptOld, bold: false, lineH: Math.round(ptOld * 1.5) });
      const pt = Math.round(46 * scale);
      blocks.push({ kind: 'text', text: formatEUR(disc), pt, bold: true, lineH: Math.round(pt * 1.4) });
    } else {
      const pt = Math.round(46 * scale);
      blocks.push({ kind: 'text', text: formatEUR(p.sale_price_ttc), pt, bold: true, lineH: Math.round(pt * 1.4) });
    }
  }

  // Centrage vertical du bloc complet.
  const gap = Math.round(10 * scale);
  const totalH = blocks.reduce((sum, b) => sum + b.lineH, 0) + gap * Math.max(0, blocks.length - 1);
  let y = Math.max(Math.round(8 * scale), Math.round((H - totalH) / 2));

  for (const b of blocks) {
    if (b.kind === 'text' && b.text) {
      ctx.font = `${b.pt}pt ${b.bold ? 'LabelBold' : 'LabelReg'}`;
      const tw = ctx.measureText(b.text).width;
      // baseline ≈ y + hauteur de capitale (~ pt * 1.1 px)
      const baseline = y + Math.round((b.pt ?? 12) * 1.15);
      ctx.fillText(b.text, Math.max(0, (W - tw) / 2), baseline);
    } else if (b.kind === 'image' && b.img) {
      ctx.drawImage(b.img, Math.round((W - (b.w ?? 0)) / 2), y, b.w, b.h);
    }
    y += b.lineH + gap;
  }

  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  await PImage.encodePNGToStream(img, sink);
  return Buffer.concat(chunks);
}

export const IMAGE_CONTENT_TYPE = 'image/png';

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
