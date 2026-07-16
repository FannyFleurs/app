import { ean13Svg } from './barcode';
import { formatEUR, round2 } from './money';

export interface LabelProduct {
  name: string;
  barcode: string | null;
  sale_price_ttc: number;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
}

export const LABEL_SIZES = [
  { key: '50x30', label: '50 × 30 mm (rouleau)', w: 50, h: 30 },
  { key: '40x30', label: '40 × 30 mm (rouleau)', w: 40, h: 30 },
  { key: '57x32', label: '57 × 32 mm (rouleau)', w: 57, h: 32 },
  { key: '32x25', label: '32 × 25 mm (petit)',   w: 32, h: 25 },
] as const;

/** Prix remisé (ou null si aucune remise valide). */
export function discountedPrice(p: LabelProduct): number | null {
  if (!p.discount_type || !p.discount_value || p.discount_value <= 0) return null;
  const raw = p.discount_type === 'percent'
    ? p.sale_price_ttc * (1 - p.discount_value / 100)
    : p.sale_price_ttc - p.discount_value;
  const v = round2(Math.max(0, raw));
  return v < p.sale_price_ttc ? v : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** HTML d'UNE étiquette (nom + code-barres + prix). */
export function oneLabelHtml(p: LabelProduct): string {
  const disc = discountedPrice(p);
  const svg = p.barcode ? ean13Svg(p.barcode, { module: 2, height: 50 }) : null;
  const priceHtml = disc != null
    ? `<span class="old">${formatEUR(p.sale_price_ttc)}</span><span class="new">${formatEUR(disc)}</span>`
    : `<span class="new">${formatEUR(p.sale_price_ttc)}</span>`;
  const bc = svg
    ? `<div class="bc">${svg}</div>`
    : (p.barcode
        ? `<div class="bcnum">${escapeHtml(p.barcode)}</div>`
        : `<div class="bcnum" style="color:#999">— pas de code-barres —</div>`);
  return `<div class="label"><div class="name">${escapeHtml(p.name)}</div>${bc}<div class="price">${priceHtml}</div></div>`;
}

/**
 * Document HTML imprimable pour une LISTE d'articles, chacun avec sa quantité.
 * Une étiquette par « page » ; toutes au même format (sizeKey).
 */
export function buildLabelsDocument(
  entries: Array<{ product: LabelProduct; qty: number }>,
  sizeKey: string,
): string {
  const size = LABEL_SIZES.find((s) => s.key === sizeKey) ?? LABEL_SIZES[0];
  const labels = entries
    .flatMap(({ product, qty }) => {
      const n = Math.max(1, Math.min(200, Math.round(qty || 0)));
      const html = oneLabelHtml(product);
      return Array.from({ length: n }, () => html);
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Étiquettes</title>
<style>
@page { size: ${size.w}mm ${size.h}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.label {
  width: ${size.w}mm; height: ${size.h}mm; padding: 1.5mm;
  page-break-after: always; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  font-family: Arial, Helvetica, sans-serif; text-align: center;
}
.label:last-child { page-break-after: auto; }
.name { font-size: 9pt; font-weight: 600; line-height: 1.05; width: 100%;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bc { width: 100%; flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
.bc svg { width: 100%; height: 100%; object-fit: contain; }
.bcnum { font-family: monospace; font-size: 10pt; }
.price { font-size: 13pt; font-weight: 700; white-space: nowrap; }
.old { text-decoration: line-through; color: #666; font-weight: 400; font-size: 9pt; margin-right: 4px; }
.new { }
</style></head>
<body onload="window.print()" onafterprint="window.close()">${labels}</body></html>`;
}

/** Ouvre une fenêtre d'impression avec le document fourni. Retourne false si
 *  les pop-ups sont bloquées. Client uniquement. */
export function openPrintWindow(html: string): boolean {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
