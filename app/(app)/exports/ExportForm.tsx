'use client';

import { useEffect, useState } from 'react';
import { CORE_FORMAT, availableFormats } from '@/lib/settings/export-formats';

/**
 * Formulaire « Nouvel export » : période, format, boutiques, puis génération et
 * téléchargement. L'historique vit dans son propre onglet ; générer ouvre le
 * téléchargement, l'historique se recharge à son ouverture.
 */
export default function ExportForm() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo]     = useState(today);
  const [format, setFormat] = useState<string>(CORE_FORMAT.value);
  const [formats, setFormats] = useState(() => availableFormats(null));
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  // Vide = toutes les boutiques. Le comptable d'un groupe peut en sortir une
  // seule ou plusieurs d'un coup, sans avoir à relancer un export par boutique.
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/settings/export-formats')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const next = availableFormats(j);
        setFormats(next);
        setFormat((cur) => next.some((f) => f.value === cur) ? cur : CORE_FORMAT.value);
      })
      .catch(() => { /* on garde le seul format de base */ });
  }, []);
  useEffect(() => {
    void fetch('/api/accounting/references')
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((j) => setStores(j.stores ?? []))
      .catch(() => setStores([]));
  }, []);

  async function generate() {
    setBusy(true); setError(null);
    const r = await fetch('/api/exports/accounting', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_start: from, period_end: to, format, store_ids: storeIds }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur de génération');
      return;
    }
    const j = await r.json();
    window.open(`/api/exports/accounting/${j.id}`, '_blank');
  }

  return (
    <section>
      <div className="card p-4 sm:p-5">
        <h2 className="font-semibold">Nouvel export</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Sélectionnez une période et un format. Chaque export est signé (SHA-256) et tracé dans l&apos;audit.
        </p>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Du</label>
            <input type="date" className="input mt-1" value={from} max={to}
                   onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Au</label>
            <input type="date" className="input mt-1" value={to} min={from} max={today}
                   onChange={(e) => setTo(e.target.value)} />
          </div>
          {formats.length > 1 ? (
            <div className="col-span-2 lg:col-span-1">
              <label className="text-xs font-medium text-ink-soft">Format</label>
              <select className="input mt-1" value={format}
                      onChange={(e) => setFormat(e.target.value)}>
                {formats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          ) : (
            <div className="col-span-2 lg:col-span-1">
              <label className="text-xs font-medium text-ink-soft">Format</label>
              <div className="mt-1 text-sm font-medium">{CORE_FORMAT.label}</div>
            </div>
          )}
          {stores.length > 1 && (
            <div className="col-span-2 lg:col-span-3">
              <label className="text-xs font-medium text-ink-soft">Boutiques</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button type="button"
                  onClick={() => setStoreIds([])}
                  aria-pressed={storeIds.length === 0}
                  className={`rounded-full border px-3 h-9 text-sm transition-colors ${
                    storeIds.length === 0
                      ? 'border-accent bg-accent-soft text-accent-deep font-medium'
                      : 'border-border bg-surface text-ink-soft hover:text-ink'
                  }`}>
                  Toutes
                </button>
                {stores.map((st) => {
                  const on = storeIds.includes(st.id);
                  return (
                    <button key={st.id} type="button"
                      onClick={() => setStoreIds((cur) =>
                        on ? cur.filter((x) => x !== st.id) : [...cur, st.id])}
                      aria-pressed={on}
                      className={`rounded-full border px-3 h-9 text-sm transition-colors ${
                        on
                          ? 'border-accent bg-accent-soft text-accent-deep font-medium'
                          : 'border-border bg-surface text-ink-soft hover:text-ink'
                      }`}>
                      {st.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <button onClick={() => void generate()} disabled={busy} className="btn-primary mt-4 w-full sm:w-auto sm:px-8">
          {busy ? 'Génération…' : 'Générer & télécharger'}
        </button>
        {formats.some((f) => f.value === 'fec_like') && (
          <p className="mt-2 text-xs text-ink-soft">
            L&apos;export FEC-like est fourni à titre informatif et ne remplace pas le FEC produit par votre comptable.
          </p>
        )}
      </div>
    </section>
  );
}
