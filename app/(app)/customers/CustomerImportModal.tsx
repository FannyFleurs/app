'use client';

import { useEffect, useState } from 'react';

interface Store { id: string; name: string; is_active?: boolean }
interface ImportResult {
  created: number; updated: number; loyalty_updated: number; skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Import de clients (+ points de fidélité) depuis un fichier Excel.
 * L'utilisateur choisit la ou les boutiques : les points sont crédités sur
 * leur compte fidélité. Un modèle .xlsx est téléchargeable pour être rempli.
 */
export default function CustomerImportModal({ onClose, onDone }: {
  onClose: () => void; onDone: () => void;
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
                {stores.map((s) => (
                  <label key={s.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${
                    selected.has(s.id) ? 'border-transparent text-white' : 'border-border hover:bg-gray-50'
                  }`} style={selected.has(s.id) ? { backgroundColor: 'var(--primary)' } : undefined}>
                    <input type="checkbox" className="accent-current" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    <span className="truncate">{s.name}</span>
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
              <div className="text-sm font-medium mb-1">3. Importer le fichier rempli</div>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:text-accent-deep file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary h-10 px-4" disabled={busy} onClick={onClose}>Annuler</button>
              <button className="btn-primary h-10 px-4" disabled={busy || selected.size === 0 || !file} onClick={() => void doImport()}>
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
                <li>{result.updated} mis à jour</li>
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
