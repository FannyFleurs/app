'use client';

import { useRef, useState } from 'react';

interface PreviewRow {
  line: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  sale_price_ttc: number | null;
  purchase_price_ht: number | null;
  tax_rate_code: string;
  color: string | null;
  is_top_product: boolean;
  visible_in_pos: boolean;
  is_active: boolean;
  errors: string[];
  warnings: string[];
}

interface PreviewResp {
  rows: PreviewRow[];
  errors: number;
  total: number;
  truncated?: boolean;
}

type Step = 'pick' | 'preview' | 'done';

export default function ProductImportModal({
  onClose, onCompleted, stores = [], backOffice = false,
}: {
  onClose: () => void;
  onCompleted: () => void;
  stores?: { id: string; name: string }[];
  backOffice?: boolean;
}) {
  const [step, setStep] = useState<Step>('pick');
  // Boutiques cibles de l'import (vide = toutes les boutiques).
  const [targetStores, setTargetStores] = useState<string[]>([]);
  const toggleStore = (id: string) =>
    setTargetStores((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; failures: Array<{ name: string; reason: string }> } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File) {
    setLoading(true); setError(null);
    try {
      // Envoi en binaire : Excel (.xlsx) ou CSV, détecté côté serveur.
      const bytes = await f.arrayBuffer();
      const r = await fetch('/api/products/import/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.message ?? j.error ?? 'Fichier illisible');
        return;
      }
      const j = (await r.json()) as PreviewResp;
      setPreview(j);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!preview) return;
    const valid = preview.rows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      setError('Aucune ligne valide à importer.');
      return;
    }
    setLoading(true); setError(null);
    const r = await fetch('/api/products/import/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: valid.map((row) => ({
          name: row.name,
          sku: row.sku,
          barcode: row.barcode,
          category: row.category,
          sale_price_ttc: row.sale_price_ttc,
          purchase_price_ht: row.purchase_price_ht,
          tax_rate_code: row.tax_rate_code,
          color: row.color,
          is_top_product: row.is_top_product,
          visible_in_pos: row.visible_in_pos,
          is_active: row.is_active,
        })),
        store_ids: targetStores,
      }),
    });
    setLoading(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur d\'import');
      return;
    }
    const j = await r.json();
    setResult({ inserted: j.inserted, failures: j.failures ?? [] });
    setStep('done');
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-2 md:p-4">
      <div className="card w-full max-w-2xl lg:max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-base md:text-lg font-semibold">Importer des produits</h2>
            <p className="text-xs md:text-sm text-ink-soft">
              Importe un fichier Excel (.xlsx) ou CSV. Aperçu avant insertion.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center h-10 w-10 rounded-full border border-border text-ink-soft hover:text-ink hover:bg-gray-50 text-lg"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {step === 'pick' && (
            <PickStep
              onFile={onFile}
              loading={loading}
              error={error}
              inputRef={inputRef}
            />
          )}

          {step === 'preview' && preview && (
            <PreviewStep preview={preview} error={error} />
          )}

          {step === 'done' && result && (
            <DoneStep result={result} />
          )}
        </div>

        <div className="border-t border-border px-4 md:px-6 py-3 flex items-center justify-end gap-2 shrink-0">
          {step === 'pick' && (
            <button onClick={onClose} className="btn-ghost">Annuler</button>
          )}
          {step === 'preview' && preview && (
            <>
              {stores.length > 1 && (
                <div className="mr-auto flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-ink-soft whitespace-nowrap">Importer dans :</span>
                  {stores.map((s) => {
                    const on = targetStores.includes(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => toggleStore(s.id)}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                                on ? 'border-accent-deep bg-accent-soft/40 text-accent-deep' : 'border-border text-ink-soft hover:bg-gray-50'
                              }`}>
                        {on ? '✓ ' : ''}{s.name}
                      </button>
                    );
                  })}
                  <span className="text-xs text-ink-soft">{targetStores.length === 0 ? '(toutes)' : ''}</span>
                </div>
              )}
              <button onClick={() => { setStep('pick'); setPreview(null); setError(null); }} className="btn-ghost">
                ← Changer de fichier
              </button>
              <button
                onClick={() => void commit()}
                disabled={loading || preview.rows.filter((r) => r.errors.length === 0).length === 0}
                className="btn-primary"
              >
                {loading
                  ? 'Import en cours…'
                  : `Importer ${preview.rows.filter((r) => r.errors.length === 0).length} produit(s)`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={() => { onCompleted(); }}
              className="btn-primary"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PickStep({
  onFile, loading, error, inputRef,
}: {
  onFile: (f: File) => void;
  loading: boolean;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
        <div className="text-base font-medium mb-1">Sélectionnez votre fichier Excel ou CSV</div>
        <div className="text-sm text-ink-soft mb-4">
          Une ligne par produit. La 1ʳᵉ ligne contient les en-têtes.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <div className="flex justify-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Analyse…' : '📁 Choisir un fichier Excel ou CSV'}
          </button>
          <a
            href="/api/products/import/template"
            className="btn-soft inline-flex items-center"
            download
          >
            ⬇ Télécharger le modèle Excel
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4 text-sm">
        <div className="font-medium mb-2">Colonnes attendues</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-soft">
          <div><strong>Nom</strong> (obligatoire) — Nom du produit</div>
          <div><strong>Prix de vente TTC (€)</strong> (obligatoire) — ex. 18,90</div>
          <div><strong>Code TVA</strong> (obligatoire) — TVA20, TVA10, TVA55, TVA0…</div>
          <div><strong>Référence (SKU)</strong> — Référence interne</div>
          <div><strong>Code-barres</strong> — EAN / UPC</div>
          <div><strong>Catégorie</strong> — Nom de la catégorie (créée si absente)</div>
          <div><strong>Prix d&apos;achat HT (€)</strong> — ex. 7,50</div>
          <div><strong>Couleur (#RRGGBB)</strong> — Couleur de la tuile</div>
          <div><strong>Produit favori</strong> — oui / non</div>
          <div><strong>Visible en caisse</strong> — oui / non (défaut oui)</div>
          <div><strong>Actif</strong> — oui / non (défaut oui)</div>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Format Excel (.xlsx) ou CSV. Les décimales acceptent le point ou la virgule.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
    </div>
  );
}

function PreviewStep({ preview, error }: { preview: PreviewResp; error: string | null }) {
  const validCount = preview.rows.filter((r) => r.errors.length === 0).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border p-2 text-center">
          <div className="text-2xl font-semibold">{preview.total}</div>
          <div className="text-[10px] uppercase tracking-widest text-ink-soft">Lignes lues</div>
        </div>
        <div className="rounded-xl border border-success/40 bg-success/5 p-2 text-center">
          <div className="text-2xl font-semibold text-success">{validCount}</div>
          <div className="text-[10px] uppercase tracking-widest text-success">Prêtes à importer</div>
        </div>
        <div className={`rounded-xl border p-2 text-center ${preview.errors > 0 ? 'border-danger/40 bg-danger/5' : 'border-border'}`}>
          <div className={`text-2xl font-semibold ${preview.errors > 0 ? 'text-danger' : ''}`}>
            {preview.errors}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-ink-soft">Avec erreur(s)</div>
        </div>
      </div>

      {preview.truncated && (
        <div className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
          ⚠ Le fichier dépasse 20 000 lignes. Seules les 20 000 premières sont prises en compte ici.
        </div>
      )}

      {preview.errors > 0 && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Les lignes en rouge contiennent des erreurs et ne seront PAS importées.
          Corrige ton fichier puis recharge-le.
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-2 py-2">L.</th>
                <th className="text-left px-2 py-2">Nom</th>
                <th className="text-left px-2 py-2">SKU</th>
                <th className="text-left px-2 py-2">Code-barres</th>
                <th className="text-left px-2 py-2">Catégorie</th>
                <th className="text-right px-2 py-2">Prix TTC</th>
                <th className="text-left px-2 py-2">TVA</th>
                <th className="text-left px-2 py-2">Erreurs / Notes</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r, idx) => {
                const hasErr = r.errors.length > 0;
                return (
                  <tr
                    key={idx}
                    className={`border-t border-border ${
                      hasErr ? 'bg-danger/5 text-danger' : r.warnings.length > 0 ? 'bg-warning/5' : ''
                    }`}
                  >
                    <td className="px-2 py-1.5 text-ink-soft tabular-nums">{r.line}</td>
                    <td className="px-2 py-1.5 font-medium">{r.name || <em className="text-ink-soft">(vide)</em>}</td>
                    <td className="px-2 py-1.5 text-ink-soft font-mono text-[10px]">{r.sku ?? '—'}</td>
                    <td className="px-2 py-1.5 text-ink-soft font-mono text-[10px]">{r.barcode ?? '—'}</td>
                    <td className="px-2 py-1.5 text-ink-soft">{r.category ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.sale_price_ttc != null && !Number.isNaN(r.sale_price_ttc)
                        ? r.sale_price_ttc.toFixed(2) + ' €'
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-ink-soft">{r.tax_rate_code}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.length > 0 && (
                        <ul className="text-[11px] list-disc list-inside">
                          {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      )}
                      {r.warnings.length > 0 && (
                        <ul className="text-[11px] list-disc list-inside text-warning">
                          {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
    </div>
  );
}

function DoneStep({
  result,
}: {
  result: { inserted: number; failures: Array<{ name: string; reason: string }> };
}) {
  return (
    <div className="space-y-3 text-center py-6">
      <div className="text-4xl">✓</div>
      <div className="text-lg font-semibold">
        {result.inserted} produit(s) importé(s)
      </div>
      {result.failures.length > 0 && (
        <div className="text-sm text-ink-soft">
          {result.failures.length} échec(s) :
          <ul className="mt-2 text-left max-w-md mx-auto rounded-xl border border-border p-3 space-y-1">
            {result.failures.map((f, i) => (
              <li key={i} className="text-xs">
                <strong>{f.name}</strong> — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
