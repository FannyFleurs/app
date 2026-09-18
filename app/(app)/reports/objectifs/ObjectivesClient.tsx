'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { formatEUR } from '@/lib/services/money';

interface StoreProgress {
  store_id: string; store: string;
  target: number; actual: number; pct: number; projection: number | null;
}
interface Progress {
  year: number; month: number;
  days_in_month: number; days_elapsed: number; is_current_month: boolean;
  stores: StoreProgress[];
  total: { target: number; actual: number; pct: number; projection: number | null };
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function pctColor(pct: number): string {
  if (pct >= 100) return 'var(--primary)';
  if (pct >= 70) return '#B7791F'; // warning
  return '#B42318'; // danger
}

/** Barre de progression fine, plafonnée visuellement à 100 %. */
function Bar({ pct }: { pct: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: pctColor(pct) }} />
    </div>
  );
}

export default function ObjectivesClient({ canEdit }: { canEdit: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(`/api/analytics/targets/progress?year=${year}&month=${month}`, { cache: 'no-store' });
      if (r.ok) {
        const j: Progress = await r.json();
        setData(j);
        setEdited(Object.fromEntries(j.stores.map((s) => [s.store_id, s.target ? String(s.target) : ''])));
      }
    } finally { setLoading(false); }
  }, [year, month]);
  useEffect(() => { void load(); }, [load]);

  function shift(delta: number) {
    setEditing(false);
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const targets: Record<string, number> = {};
      for (const [id, v] of Object.entries(edited)) {
        const n = Number(String(v).replace(',', '.'));
        targets[id] = Number.isFinite(n) && n > 0 ? n : 0;
      }
      const r = await fetch('/api/analytics/targets', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, targets }),
      });
      if (r.ok) { setEditing(false); setMsg('Objectifs enregistrés.'); await load(); }
      else setMsg('Enregistrement impossible.');
    } finally { setSaving(false); }
  }

  async function copyPrevious() {
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y -= 1; }
    const r = await fetch(`/api/analytics/targets?year=${y}&month=${m}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json() as { stores: { store_id: string; target: number }[] };
    setEdited((cur) => {
      const next = { ...cur };
      for (const s of j.stores) next[s.store_id] = s.target ? String(s.target) : '';
      return next;
    });
    setEditing(true);
    setMsg(`Objectifs de ${MONTHS[m - 1]} ${y} copiés — pensez à enregistrer.`);
  }

  const editedTotal = useMemo(
    () => Object.values(edited).reduce((a, v) => a + (Number(String(v).replace(',', '.')) || 0), 0),
    [edited],
  );

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Objectifs de CA"
        subtitle="Fixez un objectif de chiffre d'affaires TTC par boutique et par mois, et suivez l'avancement."
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="btn-soft h-9 w-9 grid place-items-center" aria-label="Mois précédent">‹</button>
            <span className="min-w-[10rem] text-center text-sm font-medium capitalize">{MONTHS[month - 1]} {year}</span>
            <button onClick={() => shift(1)} className="btn-soft h-9 w-9 grid place-items-center" aria-label="Mois suivant">›</button>
          </div>
        }
      />

      {loading ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : !data ? (
        <p className="text-sm text-danger">Impossible de charger les objectifs.</p>
      ) : (
        <>
          {/* Récap global du mois */}
          <section className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Ensemble des boutiques</h2>
              <span className="text-sm text-ink-soft">
                {data.is_current_month ? `Jour ${data.days_elapsed}/${data.days_in_month}` : 'Mois complet'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-bold tabular-nums">{formatEUR(data.total.actual)}</span>
              <span className="text-ink-soft">/ {formatEUR(data.total.target)}</span>
              <span className="ml-auto text-lg font-semibold tabular-nums" style={{ color: pctColor(data.total.pct) }}>
                {data.total.pct} %
              </span>
            </div>
            <div className="mt-2"><Bar pct={data.total.pct} /></div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-soft tabular-nums">
              {data.total.target > 0 && (
                <span>Reste {formatEUR(Math.max(0, data.total.target - data.total.actual))}</span>
              )}
              {data.total.projection != null && (
                <span>Projection fin de mois {formatEUR(data.total.projection)}</span>
              )}
            </div>
          </section>

          {/* Détail par boutique */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Par boutique</h2>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button onClick={() => void copyPrevious()} className="btn-soft h-9 px-3 text-sm">Copier le mois précédent</button>
                  {editing ? (
                    <button onClick={() => void save()} disabled={saving} className="btn-primary h-9 px-4 text-sm font-semibold disabled:opacity-50">
                      {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  ) : (
                    <button onClick={() => setEditing(true)} className="btn-soft h-9 px-3 text-sm">Modifier les objectifs</button>
                  )}
                </div>
              )}
            </div>
            {msg && <p className="mb-3 text-sm text-success">{msg}</p>}

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-ink-soft text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left py-2">Boutique</th>
                    <th className="text-right py-2 w-40">Objectif TTC</th>
                    <th className="text-right py-2 w-32">Réalisé</th>
                    <th className="text-left py-2 w-[30%]">Avancement</th>
                    {data.is_current_month && <th className="text-right py-2 w-32">Projection</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.stores.map((s) => (
                    <tr key={s.store_id} className="border-t border-border">
                      <td className="py-2.5 pr-2">{s.store}</td>
                      <td className="py-2.5 text-right">
                        {editing ? (
                          <input
                            type="number" min={0} step="0.01" inputMode="decimal"
                            className="input h-9 w-32 text-right tabular-nums"
                            value={edited[s.store_id] ?? ''}
                            placeholder="0"
                            onChange={(e) => setEdited((c) => ({ ...c, [s.store_id]: e.target.value }))}
                          />
                        ) : (
                          <span className="tabular-nums">{s.target > 0 ? formatEUR(s.target) : '—'}</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums whitespace-nowrap">{formatEUR(s.actual)}</td>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1"><Bar pct={s.pct} /></div>
                          <span className="w-12 text-right text-xs font-medium tabular-nums" style={{ color: pctColor(s.pct) }}>
                            {s.target > 0 ? `${s.pct}%` : '—'}
                          </span>
                        </div>
                      </td>
                      {data.is_current_month && (
                        <td className="py-2.5 text-right tabular-nums whitespace-nowrap text-ink-soft">
                          {s.projection != null ? formatEUR(s.projection) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {editing && (
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <td className="py-2.5">Total saisi</td>
                      <td className="py-2.5 text-right tabular-nums">{formatEUR(editedTotal)}</td>
                      <td colSpan={data.is_current_month ? 3 : 2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {!canEdit && <p className="mt-3 text-xs text-ink-soft">Lecture seule : vous n&apos;avez pas les droits pour modifier les objectifs.</p>}
          </section>
        </>
      )}
    </div>
  );
}
