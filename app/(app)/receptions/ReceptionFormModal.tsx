'use client';

import { useEffect, useState } from 'react';

interface SearchResult { id: string; name: string; sku: string | null; barcode: string | null; is_pack: boolean }
interface SelectedItem { product_id: string; name: string; sku: string | null; received_qty?: number | null }

/**
 * Création / édition d'une réception manuelle : sélection de références déjà
 * existantes (recherche + coche), liste en direct de la sélection, puis
 * validation. Modifiable tant qu'aucun article n'a été réceptionné sur le
 * PDA (`started`) — au-delà, lecture seule.
 */
export default function ReceptionFormModal({
  receptionId, stores, canWrite, onClose, onSaved,
}: {
  receptionId: string | null;
  stores: { id: string; name: string }[];
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(!!receptionId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filename, setFilename] = useState<string | null>(null);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [items, setItems] = useState<SelectedItem[]>([]);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const readOnly = !canWrite || started;

  useEffect(() => {
    if (!receptionId) return;
    void (async () => {
      try {
        const r = await fetch(`/api/receptions/${receptionId}`, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          setFilename(j.filename ?? null);
          setStoreIds(j.store_ids ?? []);
          setStarted(!!j.started);
          setItems((j.items ?? []).map((i: { product_id: string; name: string; sku: string | null; received_qty: number | null }) => ({
            product_id: i.product_id, name: i.name, sku: i.sku, received_qty: i.received_qty,
          })));
        }
      } finally { setLoading(false); }
    })();
  }, [receptionId]);

  useEffect(() => {
    if (readOnly) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/products?q=${encodeURIComponent(q)}&active=true`);
        if (r.ok) {
          const j = await r.json();
          const list: SearchResult[] = (j.products ?? j.rows ?? j ?? []).map((p: {
            id: string; name: string; sku: string | null; barcode: string | null; is_pack?: boolean;
          }) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, is_pack: !!p.is_pack }));
          setResults(list.filter((p) => !p.is_pack).slice(0, 25));
        }
      } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, readOnly]);

  function toggle(p: SearchResult) {
    setItems((cur) => (
      cur.some((i) => i.product_id === p.id)
        ? cur.filter((i) => i.product_id !== p.id)
        : [...cur, { product_id: p.id, name: p.name, sku: p.sku }]
    ));
  }
  function remove(id: string) { setItems((cur) => cur.filter((i) => i.product_id !== id)); }

  function toggleStore(id: string) {
    setStoreIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save() {
    setError(null);
    if (items.length === 0) { setError('Ajoutez au moins une référence.'); return; }
    setSaving(true);
    const body = {
      product_ids: items.map((i) => i.product_id),
      ...(receptionId ? {} : { store_ids: storeIds }),
    };
    const r = await fetch(receptionId ? `/api/receptions/${receptionId}` : '/api/receptions', {
      method: receptionId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error === 'RECEPTION_STARTED'
        ? 'Cette réception a déjà commencé sur le PDA : elle ne peut plus être modifiée.'
        : 'Enregistrement impossible.');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-2 md:p-4">
      <div className="card w-full max-w-xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">
            {receptionId ? (filename ?? 'Réception manuelle') : 'Créer une réception'}
          </h2>
          <button onClick={onClose} aria-label="Fermer"
                  className="grid h-9 w-9 place-items-center rounded-full border border-border text-ink-soft hover:bg-gray-50">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-ink-soft">Chargement…</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {started && (
              <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-deep">
                Réception commencée sur le PDA : la liste des références ne peut plus être modifiée.
              </div>
            )}

            {!receptionId && stores.length > 1 && (
              <div>
                <div className="text-sm text-ink-soft mb-1.5">Boutique(s) cible — vide = toutes les boutiques</div>
                <div className="flex flex-wrap gap-3">
                  {stores.map((s) => (
                    <label key={s.id} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={storeIds.includes(s.id)} onChange={() => toggleStore(s.id)} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!readOnly && (
              <div className="rounded-xl border border-border p-3">
                <div className="font-medium text-sm mb-2">Rechercher des références</div>
                <input autoFocus className="input" placeholder="Nom, référence, code-barres…"
                       value={q} onChange={(e) => setQ(e.target.value)} />
                <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-border rounded-lg bg-white border border-border">
                  {searching ? (
                    <div className="p-3 text-sm text-ink-soft">Recherche…</div>
                  ) : results.length === 0 ? (
                    <div className="p-3 text-sm text-ink-soft">{q ? 'Aucun produit.' : 'Tapez pour rechercher.'}</div>
                  ) : results.map((p) => {
                    const checked = items.some((i) => i.product_id === p.id);
                    return (
                      <label key={p.id} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggle(p)} />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="text-ink-soft text-xs shrink-0">{p.barcode ?? p.sku ?? '—'}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="font-medium text-sm mb-2">
                Références sélectionnées <span className="text-ink-soft">({items.length})</span>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-ink-soft">Aucune référence. Utilisez la recherche ci-dessus.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((i) => (
                    <div key={i.product_id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <span className="flex-1 truncate text-sm">{i.name}</span>
                      {i.received_qty != null && (
                        <span className="text-xs font-semibold text-success shrink-0">reçu : {i.received_qty}</span>
                      )}
                      {!readOnly && (
                        <button type="button" className="text-ink-soft hover:text-danger shrink-0"
                                onClick={() => remove(i.product_id)} aria-label="Retirer">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
          </div>
        )}

        <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <button className="btn-ghost" onClick={onClose}>{readOnly ? 'Fermer' : 'Annuler'}</button>
          {!readOnly && (
            <button className="btn-primary" disabled={saving || loading} onClick={() => void save()}>
              {saving ? 'Enregistrement…' : receptionId ? 'Enregistrer' : 'Créer la réception'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
