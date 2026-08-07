import { ean13Svg } from './barcode';
import { type LabelSettings, LABEL_DEFAULTS } from '@/lib/settings/label';
import { computeLabelLayout, barcodeSvgSize } from './label-layout';
import { type LabelProduct, discountedPrice } from './label-print-core';

export { discountedPrice };
export type { LabelProduct };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * HTML d'UNE étiquette, positionné en millimètres à partir du MÊME moteur de
 * mise en page que l'impression thermique.
 *
 * L'ancien HTML avait sa propre mise en page (flexbox, tailles en points fixes)
 * : le repli navigateur ne ressemblait donc pas à ce que sortait l'imprimante,
 * et ne suivait pas non plus le format de l'étiquette. Ici il n'y a plus qu'un
 * seul calcul, et le HTML se contente de le poser.
 */
export function oneLabelHtml(p: LabelProduct, s: LabelSettings): string {
  const layout = computeLabelLayout(p, s);
  const parts: string[] = [];

  for (const b of layout.blocks) {
    const box = `left:${b.xMm}mm;top:${b.yMm}mm;width:${b.wMm}mm;`;
    if (b.kind === 'barcode') {
      const svg = p.barcode ? ean13Svg(p.barcode, barcodeSvgSize(b)) : null;
      const inner = svg
        ? svg.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block"')
        : `<span style="font-family:monospace;font-size:${b.fontMm * 1.6}mm">${escapeHtml(p.barcode ?? '—')}</span>`;
      const totalH = b.hMm + b.fontMm * 1.25;
      parts.push(`<div class="b" style="${box}height:${totalH}mm;display:flex;align-items:center;justify-content:center">${inner}</div>`);
      continue;
    }
    const style = [
      box,
      `font-size:${b.fontMm}mm`,
      `line-height:${b.fontMm * 1.12}mm`,
      b.bold ? 'font-weight:700' : 'font-weight:400',
      b.strike ? 'text-decoration:line-through' : '',
    ].filter(Boolean).join(';');
    // Une ligne par <div> en `nowrap` : le découpage vient du moteur, le
    // navigateur ne doit pas en refaire un autre avec ses propres métriques.
    const lines = b.lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
    parts.push(`<div class="b" style="${style}">${lines}</div>`);
  }

  return `<div class="label">${parts.join('')}</div>`;
}

/**
 * Document HTML imprimable pour une LISTE d'articles, chacun avec sa quantité,
 * au format et avec les éléments configurés (réglages étiquettes).
 */
export function buildLabelsDocument(
  entries: Array<{ product: LabelProduct; qty: number }>,
  settings: LabelSettings = LABEL_DEFAULTS,
): string {
  const w = settings.width_mm;
  const h = settings.height_mm;
  const labels = entries
    .flatMap(({ product, qty }) => {
      const n = Math.max(1, Math.min(200, Math.round(qty || 0)));
      const html = oneLabelHtml(product, settings);
      return Array.from({ length: n }, () => html);
    })
    .join('');
  // Fenêtre d'impression ouverte sur about:blank : sans URL absolue, le
  // navigateur ne saurait pas où chercher la police.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Étiquettes</title>
<style>
@font-face { font-family: 'LabelPrint'; font-weight: 400;
  src: url('${origin}/fonts/Arimo-Regular.ttf') format('truetype'); }
@font-face { font-family: 'LabelPrint'; font-weight: 700;
  src: url('${origin}/fonts/Arimo-Bold.ttf') format('truetype'); }
@page { size: ${w}mm ${h}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.label {
  position: relative;
  width: ${w}mm; height: ${h}mm;
  page-break-after: always; overflow: hidden;
  font-family: LabelPrint, Arial, Helvetica, sans-serif;  /* LabelPrint = Arimo, métriques Arial */
}
.label:last-child { page-break-after: auto; }
/* Chaque bloc est posé aux coordonnées calculées par le moteur de mise en
   page : aucune règle de flux ne peut le déplacer. */
.b { position: absolute; text-align: center; }
.b > div { white-space: nowrap; }
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
