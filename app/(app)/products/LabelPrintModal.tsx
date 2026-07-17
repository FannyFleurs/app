'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { ean13Svg } from '@/lib/services/barcode';
import { discountedPrice, buildLabelsDocument, openPrintWindow, type LabelProduct } from '@/lib/services/label-print';
import { LABEL_DEFAULTS, type LabelSettings } from '@/lib/settings/label';

export default function LabelPrintModal({
  product, onClose,
}: {
  product: LabelProduct;
  onClose: () => void;
}) {
  // Quantité saisie au clavier tactile. Vide par défaut (l'utilisateur saisit).
  const [qtyStr, setQtyStr] = useState('');
  const qty = Math.min(200, Math.max(0, parseInt(qtyStr || '0', 10) || 0));
  const [settings, setSettings] = useState<LabelSettings>(LABEL_DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  // Imprimante CloudPRNT active (impression directe) : null si aucune.
  const [cloudPrinter, setCloudPrinter] = useState<string | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Format + éléments : configurés dans Réglages → Paramètres étiquettes.
  useEffect(() => {
    void (async () => {
      const [r, rc] = await Promise.all([
        fetch('/api/settings/labels'),
        fetch('/api/cloudprnt/printers'),
      ]);
      if (r.ok) setSettings((await r.json()).settings as LabelSettings);
      if (rc.ok) {
        const printers = (await rc.json()).printers as Array<{ label: string; role: string; enabled: boolean }>;
        const p = printers.find((x) => x.role === 'label' && x.enabled);
        setCloudPrinter(p ? p.label : null);
      }
    })();
  }, []);

  function pressQty(k: string) {
    setError(null);
    setQtyStr((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      if (next.length > 3) return cur;
      return Number(next) > 200 ? '200' : next;
    });
  }

  const disc = settings.show_discount ? discountedPrice(product) : null;
  const svg = product.barcode ? ean13Svg(product.barcode, { module: 2, height: 50 }) : null;

  function printLabels() {
    setError(null);
    const doc = buildLabelsDocument([{ product, qty }], settings);
    if (!openPrintWindow(doc)) {
      setError('Autorisez les fenêtres pop-up pour lancer l\'impression.');
    }
  }

  async function printCloud() {
    setError(null); setCloudMsg(null); setSending(true);
    const r = await fetch('/api/cloudprnt/print-labels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [{ product, qty }] }),
    });
    setSending(false);
    if (r.ok) {
      const j = await r.json();
      setCloudMsg(`${j.count} étiquette(s) envoyée(s) à « ${j.printer} ».`);
    } else {
      const j = await r.json().catch(() => null);
      setError(j?.error === 'NO_PRINTER' ? 'Aucune imprimante CloudPRNT active.' : 'Échec de l\'envoi à l\'imprimante.');
    }
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
              {/* Afficheur + clavier tactile */}
              <div className="mt-1 rounded-xl border border-border h-14 px-4 flex items-center justify-end text-3xl font-semibold tabular-nums bg-white">
                {qtyStr === '' ? <span className="text-ink-soft/40">0</span> : qtyStr}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => pressQty(k)}
                    className={`h-14 rounded-xl text-xl font-semibold transition-colors ${
                      k === 'C' ? 'bg-danger/10 text-danger hover:bg-danger/20'
                      : k === '⌫' ? 'bg-gray-100 text-ink-soft hover:bg-gray-200'
                      : 'bg-gray-50 hover:bg-gray-100 border border-border'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-ink-soft">
              Format {settings.width_mm} × {settings.height_mm} mm et éléments imprimés définis dans{' '}
              <a href="/settings/labels" className="underline">Réglages → Paramètres étiquettes</a>.
            </p>
            {settings.show_barcode && !product.barcode && (
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
                className="border border-dashed border-border p-2 flex flex-col items-center justify-between text-center overflow-hidden"
                style={{ width: `${settings.width_mm * 3}px`, height: `${settings.height_mm * 3}px` }}
              >
                {settings.show_name && <div className="font-semibold leading-tight text-sm line-clamp-2">{product.name}</div>}
                {settings.show_sku && product.sku && <div className="font-mono text-[10px] text-ink-soft">{product.sku}</div>}
                {settings.show_barcode && (svg ? (
                  <div className="w-full flex-1 min-h-0 flex items-center justify-center"
                       dangerouslySetInnerHTML={{ __html: svg }} />
                ) : (
                  <div className="font-mono text-xs text-ink-soft">
                    {product.barcode ?? '— pas de code-barres —'}
                  </div>
                ))}
                {settings.show_price && (
                  <div className="font-bold text-base whitespace-nowrap">
                    {disc != null && (
                      <span className="line-through text-ink-soft font-normal text-xs mr-1">
                        {formatEUR(product.sale_price_ttc)}
                      </span>
                    )}
                    {formatEUR(disc ?? product.sale_price_ttc)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {cloudMsg && <div className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{cloudMsg}</div>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Fermer</button>
          {cloudPrinter ? (
            <>
              <button onClick={printLabels} disabled={qty < 1} className="btn-soft"
                      title="Via la boîte d'impression du navigateur">
                PDF / navigateur
              </button>
              <button onClick={() => void printCloud()} disabled={qty < 1 || sending} className="btn-primary">
                {sending ? 'Envoi…' : `🖨 Imprimer sur « ${cloudPrinter} »${qty > 1 ? ` (${qty})` : ''}`}
              </button>
            </>
          ) : (
            <button onClick={printLabels} disabled={qty < 1} className="btn-primary">
              {qty >= 1
                ? (qty > 1 ? `Imprimer ${qty} étiquettes` : 'Imprimer l\'étiquette')
                : 'Imprimer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
