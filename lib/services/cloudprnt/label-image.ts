import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { formatEUR } from '@/lib/services/money';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct, discountedPrice } from '@/lib/services/label-print';

/**
 * Rendu des étiquettes en IMAGE PNG (`image/png`), format supporté nativement
 * par la mC-Label3.
 *
 * Un LOT entier est rendu dans UNE seule image : chaque étiquette occupe une
 * « case » au pas physique du média (hauteur étiquette + gap prédécoupé), le
 * contenu étant dessiné dans la partie haute (l'étiquette), le gap laissé
 * blanc. Ainsi, en un seul job :
 *   - les étiquettes s'enchaînent sans coupe entre elles,
 *   - l'imprimante ne coupe qu'UNE fois, en fin de lot,
 *   - pas d'étiquette vierge intercalaire.
 *
 * Ce pipeline (canvas serveur) est aussi la base du futur éditeur visuel.
 */

const DPMM = 8; // 203 dpi ≈ 8 points/mm
// Nombre max d'étiquettes par image (borne mémoire). Au-delà, plusieurs jobs.
const MAX_PER_SHEET = 30;

let fontsReady = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PImageMod: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bwip: any = null;

async function ensureDeps(): Promise<void> {
  if (!PImageMod) PImageMod = await import('pureimage');
  if (!bwip) {
    const m = await import('bwip-js/node');
    bwip = m.default ?? m;
  }
  if (!fontsReady) {
    const dir = path.join(process.cwd(), 'assets', 'fonts');
    PImageMod.registerFont(path.join(dir, 'BricolageGrotesque-Bold.ttf'), 'LabelBold').loadSync();
    PImageMod.registerFont(path.join(dir, 'BricolageGrotesque-Regular.ttf'), 'LabelReg').loadSync();
    fontsReady = true;
  }
}

interface Block {
  kind: 'text' | 'image';
  text?: string;
  pt?: number;
  bold?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  img?: any;
  w?: number;
  h?: number;
  lineH: number;
}

/** Prépare les blocs d'UNE étiquette (texte + code-barres décodé). */
async function buildBlocks(p: LabelProduct, s: LabelSettings, W: number, scale: number): Promise<Block[]> {
  const PImage = PImageMod;
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
  return blocks;
}

/** Dessine les blocs d'une étiquette, centrés dans la case [offsetY, offsetY+contentH]. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawBlocks(ctx: any, blocks: Block[], W: number, offsetY: number, contentH: number, scale: number): void {
  const gap = Math.round(10 * scale);
  const totalH = blocks.reduce((sum, b) => sum + b.lineH, 0) + gap * Math.max(0, blocks.length - 1);
  let y = offsetY + Math.max(Math.round(8 * scale), Math.round((contentH - totalH) / 2));

  for (const b of blocks) {
    if (b.kind === 'text' && b.text) {
      ctx.font = `${b.pt}pt ${b.bold ? 'LabelBold' : 'LabelReg'}`;
      const tw = ctx.measureText(b.text).width;
      const baseline = y + Math.round((b.pt ?? 12) * 1.15);
      ctx.fillText(b.text, Math.max(0, (W - tw) / 2), baseline);
    } else if (b.kind === 'image' && b.img) {
      ctx.drawImage(b.img, Math.round((W - (b.w ?? 0)) / 2), y, b.w, b.h);
    }
    y += b.lineH + gap;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function encode(img: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  await PImageMod.encodePNGToStream(img, sink);
  return Buffer.concat(chunks);
}

/**
 * Rend un « feuillet » : plusieurs étiquettes empilées dans une seule image,
 * au pas physique (étiquette + gap). Renvoie une liste de PNG (un par tranche
 * de MAX_PER_SHEET étiquettes) — chaque PNG = un job = une coupe en fin.
 */
export async function renderLabelSheets(labels: LabelProduct[], s: LabelSettings): Promise<Buffer[]> {
  await ensureDeps();
  const PImage = PImageMod;

  const W = Math.max(120, Math.round((s.width_mm || 51) * DPMM));
  const contentH = Math.max(80, Math.round((s.height_mm || 51) * DPMM)); // zone étiquette
  const gapPx = Math.round((s.gap_mm ?? 3) * DPMM);
  const slotH = contentH + gapPx; // pas physique
  const scale = contentH / 408;

  const out: Buffer[] = [];
  for (let start = 0; start < labels.length; start += MAX_PER_SHEET) {
    const slice = labels.slice(start, start + MAX_PER_SHEET);
    // Dernière case sans gap final (coupe au ras de la dernière étiquette).
    const H = slotH * slice.length - gapPx;
    const img = PImage.make(W, Math.max(contentH, H));
    const ctx = img.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, Math.max(contentH, H));
    ctx.fillStyle = '#000000';

    for (let i = 0; i < slice.length; i++) {
      const blocks = await buildBlocks(slice[i]!, s, W, scale);
      drawBlocks(ctx, blocks, W, i * slotH, contentH, scale);
    }
    out.push(await encode(img));
  }
  return out;
}

export const IMAGE_CONTENT_TYPE = 'image/png';

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
