'use client';

import { useEffect, useState } from 'react';
import { buildLabelsDocument, openPrintWindow, type LabelProduct } from '@/lib/services/label-print';
import { LABEL_DEFAULTS, type LabelSettings } from '@/lib/settings/label';

export default function LabelPrintModal({
  product, onClose, storeId = null,
}: {
  product: LabelProduct;
  onClose: () => void;
  /** Boutique concernée : sélectionne l'imprimante étiquettes de cette boutique. */
  storeId?: string | null;
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
  // L'imprimante est résolue par une route dédiée, accessible avec la même
  // permission que l'impression elle-même (`products.read`). La liste complète
  // des imprimantes exige `settings.read`, que les utilisateurs de la caisse
  // n'ont pas : l'interrogation échouait donc en silence et l'impression
  // directe disparaissait au profit du PDF.
  useEffect(() => {
    void (async () => {
      const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
      const [r, rc] = await Promise.all([
        fetch('/api/settings/labels'),
        fetch(`/api/cloudprnt/printers/label${qs}`),
      ]);
      if (r.ok) setSettings((await r.json()).settings as LabelSettings);
      if (rc.ok) {
        const p = (await rc.json()).printer as { label: string } | null;
        setCloudPrinter(p?.label ?? null);
      }
    })();
  }, [storeId]);

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


  function printLabels() {
    setError(null);
    const doc = buildLabelsDocument([{ product, qty }], settings);
    if (!openPrintWindow(doc)) {
      setError('Autorisez les fenêtres pop-up pour lancer l\'impression.');
    }
  }

  async function printCloud() {
    setError(null); setCloudMsg(null); setSending(true);
    try {
      const r = await fetch('/api/cloudprnt/print-labels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ product, qty }], store_id: storeId }),
      });
      if (r.ok) {
        const j = await r.json();
        // Le moteur employé fait partie du compte rendu : c'est la première
        // chose à savoir si l'étiquette sort de travers.
        const par = j.moteur === 'markup+cputil' ? '' : ' — encodage direct';
        setCloudMsg(`${j.count} étiquette(s) envoyée(s) à « ${j.printer} »${par}.`);
        return;
      }
      const j = await r.json().catch(() => null);
      if (j?.error === 'NO_PRINTER') {
        // L'imprimante a été retirée ou désactivée entre-temps : on ne laisse
        // pas l'opérateur sans solution, on bascule sur l'impression navigateur.
        setCloudPrinter(null);
        setError('Aucune imprimante étiquettes active — impression par le navigateur.');
        printLabels();
        return;
      }
      setError(j?.message
        ? `Échec de l'envoi à l'imprimante : ${j.message}`
        : "Échec de l'envoi à l'imprimante.");
    } catch {
      setError("Imprimante injoignable (réseau).");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 backdrop-blur-sm p-4 overflow-auto">
      <div className="card w-full max-w-md p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Imprimer une étiquette</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">✕</button>
        </div>

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

        {cloudMsg && <div className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{cloudMsg}</div>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Fermer</button>
          {/* Imprimante déclarée : impression directe, sans alternative — le
              repli navigateur reste automatique si elle devient injoignable. */}
          {cloudPrinter ? (
            <button onClick={() => void printCloud()} disabled={qty < 1 || sending} className="btn-primary">
              {sending ? 'Envoi…' : `🖨 Imprimer${qty > 1 ? ` ${qty} étiquettes` : " l'étiquette"}`}
            </button>
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
