'use client';

import { useEffect, useState } from 'react';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { ALL_FORMATS, CORE_FORMAT, availableFormats } from '@/lib/settings/export-formats';

interface ExportItem {
  id: string;
  period_start: string;
  period_end: string;
  format: string;
  size_bytes: string;
  sha256: string;
  created_at: string;
  generated_by: string;
}

// L'historique peut contenir des exports d'un format depuis désactivé : son
// libellé doit rester lisible, sinon une vieille ligne devient une énigme.
const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  ALL_FORMATS.map((f) => [f.value, f.label]),
);

export default function ExportsAdmin() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo]     = useState(today);
  const [format, setFormat] = useState<string>(CORE_FORMAT.value);
  // Formats proposés : le format de base, plus ceux activés dans
  // Paramètres → Formats d'export.
  const [formats, setFormats] = useState(() => availableFormats(null));
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  // Vide = toutes les boutiques. Le comptable d'un groupe peut en sortir une
  // seule ou plusieurs d'un coup, sans avoir à relancer un export par boutique.
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/exports/accounting?list=1');
    if (r.ok) setList((await r.json()).exports ?? []);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);
  // Route comptable : /api/stores exige `settings.read`, que le comptable n'a
  // pas — la liste revenait vide et le choix des boutiques disparaissait de
  // l'écran de celui à qui il sert le plus.
  useEffect(() => {
    void fetch('/api/settings/export-formats')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const next = availableFormats(j);
        setFormats(next);
        // Un format désactivé entre-temps ne doit pas rester sélectionné.
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
    // Téléchargement direct
    window.open(`/api/exports/accounting/${j.id}`, '_blank');
    void reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Exports comptables"
        subtitle="Générez des paquets pour votre expert-comptable : ventes, TVA collectée, paiements, écritures."
      />

      <section>
        <div className="card p-4 sm:p-5">
          <h2 className="font-semibold">Nouvel export</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Sélectionnez une période et un format. Chaque export est signé (SHA-256) et tracé dans l&apos;audit.
          </p>
          {/* Les trois champs s'alignent sur une ligne dès qu'il y a la place,
              et se replient l'un sous l'autre sur téléphone. */}
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
            {/* Un seul format proposé : le menu déroulant n'aurait rien à
                choisir, on annonce simplement ce qui va sortir. */}
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
                  {/* Aucune cochée = toutes : c'est le cas courant, il ne doit
                      demander aucun geste. */}
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

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">Historique des exports</h2>
        {loading ? (
          <div className="text-sm text-ink-soft">Chargement…</div>
        ) : list.length === 0 ? (
          <EmptyState icon="◇" title="Aucun export généré" />
        ) : (
          // `overflow-hidden` coupait net les six colonnes sur téléphone :
          // « Télécharger » devenait inatteignable. On laisse défiler.
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[48rem]">
              <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Période</th>
                  <th className="text-left px-4 py-3 font-semibold">Format</th>
                  <th className="text-right px-4 py-3 font-semibold">Taille</th>
                  <th className="text-left px-4 py-3 font-semibold">Auteur</th>
                  <th className="text-left px-4 py-3 font-semibold">SHA-256</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-3 whitespace-nowrap">{e.period_start} → {e.period_end}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><Badge tone="neutral">{FORMAT_LABEL[e.format] ?? e.format}</Badge></td>
                    <td className="px-4 py-3 text-right text-ink-soft">{formatBytes(Number(e.size_bytes))}</td>
                    <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{e.generated_by}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{e.sha256.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(e.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={`/api/exports/accounting/${e.id}`} target="_blank" rel="noreferrer"
                         className="text-accent-deep text-sm hover:underline">
                        Télécharger
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}
