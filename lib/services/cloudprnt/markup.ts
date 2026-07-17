import { formatEUR } from '@/lib/services/money';
import { isValidEan13 } from '@/lib/services/ean';
import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct, discountedPrice } from '@/lib/services/label-print';

/**
 * Rendu d'une étiquette en Star Document Markup (`text/vnd.star.markup`),
 * le format natif des imprimantes Star (dont la mC-Label3) via CloudPRNT.
 *
 * Avantages vs image : texte et code-barres rendus par l'imprimante (nets,
 * pas de rasterisation, pas de dépendance), gestion native de l'EAN-13.
 *
 * NB : la mise en page fine (hauteur code-barres, sauts) sur une étiquette
 * prédécoupée se règle à l'usage — d'où ce module isolé, facile à ajuster.
 */

export const STAR_MARKUP_CONTENT_TYPE = 'text/vnd.star.markup';

/** Échappe les caractères significatifs du markup ('[' et ']'). */
function esc(s: string): string {
  return s.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/** Markup d'UNE étiquette (sans avance/coupe finale). */
export function oneLabelMarkup(p: LabelProduct, s: LabelSettings): string {
  const lines: string[] = ['[align: centre]'];

  if (s.show_name && p.name) {
    lines.push('[magnify: width 1; height 1]');
    lines.push('[emphasis] ' + esc(p.name) + ' [emphasis]');
  }
  if (s.show_sku && p.sku) {
    lines.push('[magnify: width 1; height 1]');
    lines.push(esc(p.sku));
  }
  if (s.show_barcode) {
    if (p.barcode && isValidEan13(p.barcode)) {
      lines.push(`[barcode: type ean13; data ${p.barcode}; height 48; module 2; hri below]`);
    } else if (p.barcode) {
      lines.push(esc(p.barcode));
    }
  }
  if (s.show_price) {
    const disc = s.show_discount ? discountedPrice(p) : null;
    if (disc != null) {
      lines.push('[magnify: width 1; height 1]' + esc(formatEUR(p.sale_price_ttc)));
      lines.push('[magnify: width 2; height 2]' + esc(formatEUR(disc)) + '[magnify: width 1; height 1]');
    } else {
      lines.push('[magnify: width 2; height 2]' + esc(formatEUR(p.sale_price_ttc)) + '[magnify: width 1; height 1]');
    }
  }
  return lines.join('\n');
}

/**
 * Document markup complet pour une liste d'articles (chacun × sa quantité).
 * Une avance + coupe entre chaque étiquette : sur une imprimante à étiquettes
 * prédécoupées, cela avance jusqu'à l'étiquette suivante.
 */
export function buildLabelsMarkup(
  entries: Array<{ product: LabelProduct; qty: number }>,
  settings: LabelSettings,
): string {
  const blocks: string[] = [];
  for (const { product, qty } of entries) {
    const n = Math.max(1, Math.min(200, Math.round(qty || 0)));
    const one = oneLabelMarkup(product, settings);
    for (let i = 0; i < n; i++) {
      blocks.push(one + '\n[feed: 1]\n[cut]');
    }
  }
  return blocks.join('\n') + '\n';
}

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.min(200, Math.round(e.qty || 0))), 0);
}
