'use client';

import { useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';
import { ean13Svg } from '@/lib/services/barcode';

interface LabelProduct {
  name: string;
  barcode: string | null;
  sale_price_ttc: number;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
}

const SIZES = [
  { key: '50x30', label: '50 × 30 mm (rouleau)', w: 50, h: 30 },
  { key: '40x30', label: '40 × 30 mm (rouleau)', w: 40, h: 30 },
  { key: '57x32', label: '57 × 32 mm (rouleau)', w: 57, h: 32 },
  { key: '32x25', label: '32 × 25 mm (petit)',   w: 32, h: 25 },
];

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

export default function LabelPrintModal({
  product, onClose,
}: {
  product: LabelProduct;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [sizeKey, setSizeKey] = useState('50x30');
  const [error, setError] = useState<string | null>(null);

  const size = SIZES.find((s) => s.key === sizeKey)!;
  const disc = discountedPrice(product);
  const svg = product.barcode ? ean13Svg(product.barcode, { module: 2, height: 50 }) : null;

  // HTML d'une étiquette (réutilisé pour l'aperçu ET l'impression).
  const oneLabelHtml = useMemo(() => {
    const priceHtml = disc != null
      ? `<span class="old">${formatEUR(product.sale_price_ttc)}</span><span class="new">${formatEUR(disc)}</span>`
      : `<span class="new">${formatEUR(product.sale_price_ttc)}</span>`;
    const bc = svg
      ? `<div class="bc">${svg}</div>`
      : (product.barcode
          ? `<div class="bcnum">${escapeHtml(product.barcode)}</div>`
          : `<div class="bcnum" style="color:#999">— pas de code-barres —</div>`);
    return `<div class="label"><div class="name">${escapeHtml(product.name)}</div>${bc}<div class="price">${priceHtml}</div></div>`;
  }, [product, disc, svg]);

  function buildDoc(): string {
    const n = Math.max(1, Math.min(200, Math.round(qty)));
    const labels = Array.from({ length: n }, () => oneLabelHtml).join('');
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

  function printLabels() {
    setError(null);
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) { setError('Autorisez les fenêtres pop-up pour lancer l\'impression.'); return; }
    w.document.open();
    w.document.write(buildDoc());
    w.document.close();
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 backdrop-blur-sm p-4 overflow-auto">
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Imprimer une étiquette</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">✕</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Réglages */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink-soft">Quantité d&apos;étiquettes</label>
              <input
                type="number" min={1} max={200}
                className="input mt-1"
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-soft">Format d&apos;étiquette</label>
              <select className="input mt-1" value={sizeKey} onChange={(e) => setSizeKey(e.target.value)}>
                {SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-ink-soft">
                Une étiquette par « page » : l&apos;imprimante à rouleau enchaîne les {qty} étiquette{qty > 1 ? 's' : ''}.
              </p>
            </div>
            {!product.barcode && (
              <p className="text-xs text-warning">
                Cet article n&apos;a pas de code-barres : l&apos;étiquette n&apos;affichera que le nom et le prix.
                Ajoutez un code-barres (EAN-13) dans l&apos;onglet Détails pour l&apos;imprimer.
              </p>
            )}
            {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          </div>

          {/* Aperçu */}
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-soft mb-2">Aperçu</div>
            <div className="rounded-xl border border-border bg-white p-3 grid place-items-center">
              <div
                className="border border-dashed border-border p-2 flex flex-col items-center justify-between text-center"
                style={{ width: `${size.w * 3}px`, height: `${size.h * 3}px` }}
              >
                <div className="font-semibold leading-tight text-sm line-clamp-2">{product.name}</div>
                {svg ? (
                  <div className="w-full flex-1 min-h-0 flex items-center justify-center"
                       dangerouslySetInnerHTML={{ __html: svg }} />
                ) : (
                  <div className="font-mono text-xs text-ink-soft">
                    {product.barcode ?? '— pas de code-barres —'}
                  </div>
                )}
                <div className="font-bold text-base whitespace-nowrap">
                  {disc != null && (
                    <span className="line-through text-ink-soft font-normal text-xs mr-1">
                      {formatEUR(product.sale_price_ttc)}
                    </span>
                  )}
                  {formatEUR(disc ?? product.sale_price_ttc)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Fermer</button>
          <button onClick={printLabels} className="btn-primary">
            Imprimer {qty > 1 ? `${qty} étiquettes` : 'l\'étiquette'}
          </button>
        </div>
      </div>
    </div>
  );
}
