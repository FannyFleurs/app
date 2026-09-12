'use client';

import { useEffect, useState } from 'react';

interface Store { id: string; name: string; is_active?: boolean }
interface ImportResult {
  created: number; updated: number; ambiguous: number; loyalty_updated: number; skipped: number;
  errors: { row: number; message: string }[];
}
interface PreviewSummary {
  total: number; create: number; update: number; ambiguous: number; invalid: number;
  with_points: number; by_email: number; by_phone: number; by_name: number;
}
interface PreviewItem { row: number; label: string; action: string; matched_by?: string; points: number; error?: string }
interface Preview { summary: PreviewSummary; items: PreviewItem[] }

const ACTION_LABEL: Record<string, string> = {
  create: 'Nouveau', update: 'Fusion', ambiguous: 'Ambigu', invalid: 'Invalide',
};

/**
 * Import de clients (+ points de fidélité) depuis un fichier Excel.
 * L'utilisateur choisit la ou les boutiques (les points y sont crédités), peut
 * PRÉVISUALISER le résultat (rapprochement e-mail / téléphone / nom, sans rien
 * écrire) puis confirmer l'import.
 */
export default function CustomerImportModal({ onClose, onDone }: {
  onClose: () => void; onDone: () => void;
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    void fetch('/api/stores')
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((j) => {
        const list: Store[] = (j.stores ?? []).filter((s: Store) => s.is_active !== false);
        setStores(list);
        if (list.length === 1 && list[0]) setSelected(new Set([list[0].id]));
      })
      .catch(() => setStores([]));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function doPreview() {
    if (!file) { setError('Sélectionnez le fichier Excel rempli.'); return; }
    setPreviewing(true); setError(null); setPreview(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/customers/import/preview', { method: 'POST', body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok) setError(j?.message ?? 'Aperçu impossible.');
      else setPreview(j as Preview);
    } catch {
      setError('Erreur réseau pendant l’aperçu.');
    } finally {
      setPreviewing(false);
    }
  }

  async function doImport() {
    if (selected.size === 0) { setError('Choisissez au moins une boutique.'); return; }
    if (!file) { setError('Sélectionnez le fichier Excel rempli.'); return; }
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('store_ids', JSON.stringify([...selected]));
    try {
      const r = await fetch('/api/customers/import', { method: 'POST', body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setError(j?.message ?? 'Échec de l’import.'); }
      else { setResult(j as ImportResult); onDone(); }
    } catch {
      setError('Erreur réseau pendant l’import.');
    } finally {
      setBusy(false);
    }
  }

  const s = preview?.summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">Importer des clients</h3>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none" aria-label="Fermer">✕</button>
        </div>

        {!result ? (
          <>
            {/* Étape 1 : boutiques */}
            <div>
              <div className="text-sm font-medium mb-1">1. Boutique(s) où créditer les points de fidélité</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {stores.map((st) => (
                  <label key={st.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${
                    selected.has(st.id) ? 'border-transparent text-white' : 'border-border hover:bg-gray-50'
                  }`} style={selected.has(st.id) ? { backgroundColor: 'var(--primary)' } : undefined}>
                    <input type="checkbox" className="accent-current" checked={selected.has(st.id)} onChange={() => toggle(st.id)} />
                    <span className="truncate">{st.name}</span>
                  </label>
                ))}
                {stores.length === 0 && <p className="text-xs text-ink-soft">Aucune boutique.</p>}
              </div>
            </div>

            {/* Étape 2 : modèle */}
            <div>
              <div className="text-sm font-medium mb-1">2. Télécharger le modèle et le remplir</div>
              <a href="/api/customers/import/template" className="btn-soft h-10 px-3.5 inline-flex items-center gap-2 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>
                Modèle Excel (.xlsx)
              </a>
              <p className="text-xs text-ink-soft mt-1">Une ligne par client. Colonne « Points fidélité » = nombre entier.</p>
            </div>

            {/* Étape 3 : fichier rempli */}
            <div>
              <div className="text-sm font-medium mb-1">3. Choisir le fichier rempli, puis prévisualiser</div>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setPreview(null); }}
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:text-accent-deep file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </div>

            {/* Aperçu (simulation) */}
            {s && (
              <div className="rounded-xl border border-border p-3 text-sm space-y-2">
                <div className="font-medium">Aperçu — {s.total} ligne(s), rien n&apos;est encore enregistré</div>
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-ink-soft">
                  <span>Nouveaux clients</span><span className="text-right font-semibold text-ink tabular-nums">{s.create}</span>
                  <span>Fusions (fiches mises à jour)</span><span className="text-right font-semibold text-ink tabular-nums">{s.update}</span>
                  <span className="pl-3 text-xs">· par e-mail / téléphone / nom</span>
                  <span className="text-right text-xs tabular-nums">{s.by_email} / {s.by_phone} / {s.by_name}</span>
                  {s.ambiguous > 0 && (<><span className="text-warning">Ambigus (créés, à vérifier)</span><span className="text-right text-warning tabular-nums">{s.ambiguous}</span></>)}
                  {s.invalid > 0 && (<><span className="text-danger">Invalides (ignorés)</span><span className="text-right text-danger tabular-nums">{s.invalid}</span></>)}
                  <span>Lignes avec points fidélité</span><span className="text-right tabular-nums">{s.with_points}</span>
                </div>
                <p className="text-[11px] text-ink-soft">
                  Les points sont <strong>cumulés</strong> au solde existant de la (des) boutique(s) choisie(s) (rapatriement).
                  L&apos;e-mail d&apos;une fiche fusionnée n&apos;est jamais écrasé.
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-soft">Voir le détail par ligne</summary>
                  <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                    {preview!.items.map((it) => (
                      <div key={it.row} className="flex items-center justify-between gap-2 border-b border-border/50 py-0.5 last:border-0">
                        <span className="truncate">L{it.row} · {it.label || '—'}</span>
                        <span className={`shrink-0 ${
                          it.action === 'invalid' ? 'text-danger'
                          : it.action === 'ambiguous' ? 'text-warning'
                          : it.action === 'update' ? 'text-accent-deep' : 'text-ink-soft'}`}>
                          {ACTION_LABEL[it.action] ?? it.action}{it.matched_by ? ` (${it.matched_by})` : ''}{it.error ? ` — ${it.error}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary h-10 px-4" disabled={busy || previewing} onClick={onClose}>Annuler</button>
              <button className="btn-soft h-10 px-4" disabled={busy || previewing || !file} onClick={() => void doPreview()}>
                {previewing ? 'Analyse…' : 'Prévisualiser'}
              </button>
              <button className="btn-primary h-10 px-4" disabled={busy || previewing || selected.size === 0 || !file} onClick={() => void doImport()}>
                {busy ? 'Import en cours…' : 'Importer'}
              </button>
            </div>
          </>
        ) : (
          /* Résultat */
          <div className="space-y-3">
            <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-deep">
              <div className="font-semibold">Import terminé</div>
              <ul className="mt-1 space-y-0.5">
                <li>{result.created} client(s) créé(s)</li>
                <li>{result.updated} fusionné(s) (fiche existante mise à jour)</li>
                {result.ambiguous > 0 && <li className="text-warning">{result.ambiguous} ambigu(s) créé(s) — à vérifier</li>}
                <li>{result.loyalty_updated} avec points de fidélité crédités</li>
                {result.skipped > 0 && <li className="text-warning">{result.skipped} ligne(s) ignorée(s)</li>}
              </ul>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-xl border border-border px-4 py-3 text-sm max-h-40 overflow-y-auto">
                <div className="font-medium text-danger mb-1">Lignes en erreur :</div>
                <ul className="space-y-0.5 text-ink-soft">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={i}>Ligne {e.row} : {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button className="btn-primary h-10 px-4" onClick={onClose}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
