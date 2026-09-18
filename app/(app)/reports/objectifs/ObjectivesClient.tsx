'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jui', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const WD_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const WD_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const GREEN = 'var(--primary)';
const RED = '#B42318';
const AMBER = '#B7791F';

function eur0(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

interface DayRow {
  date: string; weekday: number; open: boolean;
  objective: number; realized: number; tickets: number; avg: number;
  future: boolean; status: 'closed' | 'future' | 'ok' | 'below';
}
interface Data {
  store_id: string;
  stores: { store_id: string; store: string }[];
  weights: number[];
  year: number; month: number; daysInMonth: number;
  objectiveMonth: number; openDays: number;
  days: DayRow[];
  realizedToDate: number; theoreticalToDate: number; avanceRetard: number;
  projection: number; attainmentPct: number;
  objectiveToday: number; objectiveWeek: number;
  objectivePerOpenDay: number; objectivePerWeek: number;
  isPast: boolean; isCurrent: boolean; isFuture: boolean;
  yearSeries: { month: number; objective: number; realized: number }[];
  yearObjective: number; yearRealized: number;
}

export default function ObjectivesClient({ canEdit }: { canEdit: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [storeId, setStoreId] = useState<string>('');
  const [mode, setMode] = useState<'mensuel' | 'annuel'>('mensuel');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGear, setShowGear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ year: String(year), month: String(month) });
    if (storeId) qs.set('store_id', storeId);
    try {
      const r = await fetch(`/api/analytics/objectives?${qs.toString()}`, { cache: 'no-store' });
      if (r.ok) {
        const j: Data = await r.json();
        setData(j);
        if (!storeId) setStoreId(j.store_id);
      }
    } finally { setLoading(false); }
  }, [year, month, storeId]);
  useEffect(() => { void load(); }, [load]);

  function shift(delta: number) {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  }

  // Réalisé de la semaine en cours (lundi→dimanche), calculé depuis les jours.
  const weekRealized = useMemo(() => {
    if (!data || !data.isCurrent) return 0;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
    const wd = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const start = new Date(new Date(today + 'T00:00:00Z').getTime() - wd * 86400000);
    const isoStart = start.toISOString().slice(0, 10);
    const isoEnd = new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    return data.days.filter((d) => d.date >= isoStart && d.date <= isoEnd).reduce((a, d) => a + d.realized, 0);
  }, [data]);

  const monthRealized = useMemo(
    () => (data ? data.days.reduce((a, d) => a + d.realized, 0) : 0),
    [data],
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Objectifs de CA"
        subtitle="Suivi du chiffre d'affaires réel par rapport à l'objectif (TTC)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data && data.stores.length > 1 && (
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="input h-9 w-auto text-sm">
                {data.stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.store}</option>)}
              </select>
            )}
            <div className="inline-flex rounded-full border border-border bg-white p-0.5">
              {(['mensuel', 'annuel'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`h-8 px-3 rounded-full text-sm font-semibold capitalize transition-colors ${mode === m ? 'accent-bar text-white' : 'text-ink-soft'}`}>
                  {m}
                </button>
              ))}
            </div>
            {canEdit && (
              <button onClick={() => setShowGear(true)} className="btn-soft h-9 w-9 grid place-items-center" title="Réglages (objectif du mois, semaine-type)" aria-label="Réglages">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
              </button>
            )}
          </div>
        }
      />

      {/* Navigation de mois */}
      <div className="flex items-center gap-2">
        <button onClick={() => shift(-1)} className="btn-soft h-9 w-9 grid place-items-center" aria-label="Mois précédent">‹</button>
        <span className="min-w-[11rem] text-center text-base font-semibold capitalize">{MONTHS[month - 1]} {year}</span>
        <button onClick={() => shift(1)} className="btn-soft h-9 w-9 grid place-items-center" aria-label="Mois suivant">›</button>
      </div>

      {loading || !data ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : mode === 'annuel' ? (
        <AnnualView data={data} />
      ) : data.objectiveMonth <= 0 ? (
        <section className="card p-6 text-center">
          <p className="text-sm text-ink-soft">Aucun objectif défini pour {MONTHS[month - 1]} {year}.</p>
          {canEdit && <button onClick={() => setShowGear(true)} className="btn-primary h-10 px-4 text-sm mt-3">Définir l&apos;objectif du mois</button>}
        </section>
      ) : (
        <>
          <Banner data={data} />
          <StatCards data={data} weekRealized={weekRealized} monthRealized={monthRealized} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Previsionnel data={data} />
            <Calendar data={data} />
          </div>
          <YearChart data={data} />
          <Journal data={data} />
        </>
      )}

      {showGear && data && (
        <GearModal
          storeId={data.store_id}
          storeName={data.stores.find((s) => s.store_id === data.store_id)?.store ?? ''}
          year={year} month={month}
          objectiveMonth={data.objectiveMonth}
          weights={data.weights}
          onClose={() => setShowGear(false)}
          onSaved={() => { setShowGear(false); void load(); }}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Bandeau ---- */

function Banner({ data }: { data: Data }) {
  const behind = data.avanceRetard < 0;
  const color = data.avanceRetard >= 0 ? GREEN : RED;
  const theoPct = data.objectiveMonth > 0 ? Math.min(100, (data.theoreticalToDate / data.objectiveMonth) * 100) : 0;
  const realPct = data.objectiveMonth > 0 ? Math.min(100, (data.realizedToDate / data.objectiveMonth) * 100) : 0;
  return (
    <section className="card p-5" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 5%, var(--surface))' }}>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-soft font-semibold">Avance / retard — {MONTHS[data.month - 1]}</div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-4xl font-bold tabular-nums" style={{ color }}>
              {data.avanceRetard >= 0 ? '+' : ''}{eur0(data.avanceRetard)}
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, white)`, color }}>
              {behind ? '▼ En retard' : '▲ En avance'}
            </span>
          </div>
          {/* Barre de rythme */}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-ink-soft mb-1">
              <span>1 {MONTHS_SHORT[data.month - 1]}</span>
              <span>{eur0(data.objectiveMonth)}</span>
            </div>
            <div className="relative h-3 rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${theoPct}%`, backgroundColor: 'color-mix(in srgb, #D9A825 55%, white)' }} />
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${realPct}%`, backgroundColor: color }} />
            </div>
            <div className="flex justify-between text-[11px] text-ink-soft mt-1">
              <span>CA : {eur0(data.realizedToDate)}</span>
              <span>Théorique : {eur0(data.theoreticalToDate)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 content-start">
          <MiniTile label="CA réalisé" value={eur0(data.realizedToDate)} />
          <MiniTile label="Théorique" value={eur0(data.theoreticalToDate)} />
          <MiniTile label="Objectif mois" value={eur0(data.objectiveMonth)} />
          <MiniTile label="Reste" value={eur0(Math.max(0, data.objectiveMonth - data.realizedToDate))} />
          <div className="col-span-2 rounded-xl border border-[color:var(--primary)]/20 p-3 text-center" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 8%, var(--surface))' }}>
            <div className="text-[11px] uppercase tracking-wider text-ink-soft font-semibold">Projection fin mois</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: GREEN }}>{eur0(data.projection)}</div>
            <div className="text-[11px] text-ink-soft">{data.isPast ? 'Mois terminé' : 'au rythme actuel'}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 text-center">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-ink-soft">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------ Stat cards ---- */

function StatCards({ data, weekRealized, monthRealized }: { data: Data; weekRealized: number; monthRealized: number }) {
  const moisPct = data.objectiveMonth > 0 ? (monthRealized / data.objectiveMonth) * 100 : 0;
  const anPct = data.yearObjective > 0 ? (data.yearRealized / data.yearObjective) * 100 : 0;
  const cards: Array<{ label: string; value: string; sub: string; tone: string }> = [
    { label: "Aujourd'hui", value: eur0(data.days.find((d) => d.date === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }))?.realized ?? 0), sub: `Objectif du jour ${eur0(data.objectiveToday)}`, tone: GREEN },
    { label: 'Cette semaine', value: eur0(weekRealized), sub: `Objectif : ${eur0(data.objectiveWeek)}`, tone: AMBER },
    { label: 'Ce mois', value: eur0(monthRealized), sub: `${moisPct.toFixed(1)}% objectif`, tone: AMBER },
    { label: 'CA annuel cumulé', value: eur0(data.yearRealized), sub: `sur ${eur0(data.yearObjective)} objectif`, tone: GREEN },
    { label: "Taux d'atteinte", value: `${data.attainmentPct}%`, sub: 'vs théorique à date', tone: data.attainmentPct >= 100 ? GREEN : RED },
  ];
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="card p-4 border-t-2" style={{ borderTopColor: c.tone }}>
          <div className="text-[11px] uppercase tracking-wider text-ink-soft font-semibold">{c.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{c.value}</div>
          <div className="text-[11px] text-ink-soft">{c.sub}</div>
        </div>
      ))}
    </section>
  );
}

/* ---------------------------------------------------------- Prévisionnel ---- */

function Previsionnel({ data }: { data: Data }) {
  const rows = [
    { label: 'Objectif mensuel', value: eur0(data.objectiveMonth), strong: true },
    { label: 'Jours ouvrés', value: `${data.openDays} jours` },
    { label: 'Objectif / jour ouvré', value: eur0(data.objectivePerOpenDay) },
    { label: 'Objectif / semaine', value: eur0(data.objectivePerWeek) },
  ];
  return (
    <section className="card p-5">
      <h2 className="text-[11px] uppercase tracking-widest text-ink-soft font-semibold mb-3">Prévisionnel — {MONTHS[data.month - 1]}</h2>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between py-2.5">
            <span className="text-sm text-ink-soft">{r.label}</span>
            <span className={`tabular-nums ${r.strong ? 'text-lg font-bold' : 'font-semibold'}`} style={r.strong ? { color: GREEN } : undefined}>{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------- Calendar ---- */

function statusColor(s: DayRow['status']): { bg: string; fg: string } {
  switch (s) {
    case 'ok': return { bg: 'color-mix(in srgb, var(--primary) 16%, white)', fg: 'var(--primary-deep)' };
    case 'below': return { bg: 'color-mix(in srgb, #B42318 12%, white)', fg: '#B42318' };
    case 'future': return { bg: 'var(--surface)', fg: 'var(--ink-soft, #6b7280)' };
    default: return { bg: 'var(--muted)', fg: 'var(--ink-soft, #6b7280)' }; // closed
  }
}

function Calendar({ data }: { data: Data }) {
  const first = data.days[0];
  const lead = first ? first.weekday : 0; // 0=lundi
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  return (
    <section className="card p-5">
      <h2 className="text-[11px] uppercase tracking-widest text-ink-soft font-semibold mb-3">Calendrier — {MONTHS[data.month - 1]} {data.year}</h2>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-soft mb-2">
        <Legend color="color-mix(in srgb, var(--primary) 16%, white)" label="≥ obj." />
        <Legend color="color-mix(in srgb, #B42318 12%, white)" label="< obj." />
        <Legend color="var(--muted)" label="Fermé" />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink-soft mb-1">
        {WD_SHORT.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
        {data.days.map((d) => {
          const c = statusColor(d.status);
          const isToday = d.date === today;
          const dayNum = Number(d.date.slice(8, 10));
          return (
            <div key={d.date}
              className="rounded-lg p-1.5 text-left min-h-[3rem]"
              style={{ backgroundColor: c.bg, color: c.fg, outline: isToday ? '2px solid #D9A825' : undefined }}>
              <div className="text-[11px] font-semibold">{dayNum}</div>
              <div className="text-[11px] tabular-nums">{d.open ? eur0(d.realized) : 'Ferm.'}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: color }} />{label}
    </span>
  );
}

/* ------------------------------------------------------------ Year chart ---- */

function YearChart({ data }: { data: Data }) {
  const max = Math.max(1, ...data.yearSeries.map((m) => Math.max(m.objective, m.realized)));
  const W = 720, H = 220, padL = 40, padR = 8, padT = 10, padB = 22;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const slot = innerW / 12;
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const objPath = data.yearSeries.map((m, i) => `${i === 0 ? 'M' : 'L'} ${(padL + slot * i + slot / 2).toFixed(1)} ${y(m.objective).toFixed(1)}`).join(' ');
  return (
    <section className="card p-5">
      <h2 className="text-[11px] uppercase tracking-widest text-ink-soft font-semibold mb-3">CA mensuel — réel vs objectif · {data.year}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img">
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={padL} y1={padT + innerH - g * innerH} x2={W - padR} y2={padT + innerH - g * innerH} stroke="rgba(120,120,120,0.16)" strokeWidth={1} />
        ))}
        {data.yearSeries.map((m, i) => {
          const bx = padL + slot * i + slot * 0.2;
          const bw = slot * 0.6;
          const h = (m.realized / max) * innerH;
          const reached = m.objective > 0 && m.realized >= m.objective;
          const fill = m.realized === 0 ? 'transparent' : reached ? GREEN : RED;
          return (
            <g key={i}>
              <rect x={bx} y={padT + innerH - h} width={bw} height={Math.max(0, h)} rx={3}
                fill={fill} opacity={0.85} />
              <text x={padL + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#6b7280">{MONTHS_SHORT[i]}</text>
            </g>
          );
        })}
        <path d={objPath} fill="none" stroke="#D9A825" strokeWidth={2} strokeDasharray="4 4" />
        {data.yearSeries.map((m, i) => m.objective > 0 ? (
          <circle key={i} cx={padL + slot * i + slot / 2} cy={y(m.objective)} r={2.5} fill="#D9A825" />
        ) : null)}
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-[11px] text-ink-soft">
        <Legend color={GREEN} label="Réalisé ≥ objectif" />
        <Legend color={RED} label="Réalisé < objectif" />
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ backgroundColor: '#D9A825' }} />Objectif</span>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Journal ---- */

function Journal({ data }: { data: Data }) {
  const rows = data.days.filter((d) => d.open && !d.future).slice().reverse();
  function exportCsv() {
    const head = ['Date', 'Jour', 'CA réalisé', 'Objectif', 'Écart €', 'Écart %', 'Transactions', 'Panier moyen'];
    const lines = rows.map((d) => {
      const ecart = d.realized - d.objective;
      const pct = d.objective > 0 ? (ecart / d.objective) * 100 : 0;
      return [d.date, WD_LONG[d.weekday], String(d.realized), String(d.objective), String(Math.round(ecart)), `${pct.toFixed(1)}%`, String(d.tickets), String(Math.round(d.avg))];
    });
    const csv = [head, ...lines].map((r) => r.join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `objectifs-journal-${data.year}-${String(data.month).padStart(2, '0')}.csv`;
    a.click();
  }
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-widest text-ink-soft font-semibold">Journal — {MONTHS[data.month - 1]} {data.year}</h2>
        <button onClick={exportCsv} className="btn-soft h-9 px-3 text-sm inline-flex items-center gap-2">Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-ink-soft text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-2">Date</th>
              <th className="text-left py-2">Jour</th>
              <th className="text-right py-2">CA réalisé</th>
              <th className="text-right py-2">Objectif</th>
              <th className="text-right py-2">Écart €</th>
              <th className="text-right py-2">Écart %</th>
              <th className="text-right py-2">Transactions</th>
              <th className="text-right py-2">Panier moy.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const ecart = d.realized - d.objective;
              const pct = d.objective > 0 ? (ecart / d.objective) * 100 : 0;
              const good = ecart >= 0;
              return (
                <tr key={d.date} className="border-t border-border">
                  <td className="py-2 tabular-nums whitespace-nowrap">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}/{d.date.slice(0, 4)}</td>
                  <td className="py-2">{WD_LONG[d.weekday]}</td>
                  <td className="py-2 text-right tabular-nums font-semibold">{eur0(d.realized)}</td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">{eur0(d.objective)}</td>
                  <td className="py-2 text-right tabular-nums font-medium" style={{ color: good ? GREEN : RED }}>{good ? '+' : ''}{eur0(ecart)}</td>
                  <td className="py-2 text-right tabular-nums font-medium" style={{ color: good ? GREEN : RED }}>{good ? '+' : ''}{pct.toFixed(1)}%</td>
                  <td className="py-2 text-right tabular-nums">{d.tickets}</td>
                  <td className="py-2 text-right tabular-nums">{eur0(d.avg)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-ink-soft">Aucun jour ouvré réalisé sur ce mois.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Vue annuelle ---- */

function AnnualView({ data }: { data: Data }) {
  const pct = data.yearObjective > 0 ? (data.yearRealized / data.yearObjective) * 100 : 0;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniTile label={`Objectif ${data.year}`} value={eur0(data.yearObjective)} />
        <MiniTile label="CA réalisé cumulé" value={eur0(data.yearRealized)} />
        <MiniTile label="Taux d'atteinte" value={`${pct.toFixed(1)}%`} />
      </section>
      <YearChart data={data} />
      <section className="card p-5">
        <h2 className="text-[11px] uppercase tracking-widest text-ink-soft font-semibold mb-3">Détail par mois — {data.year}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="text-ink-soft text-xs uppercase tracking-wider">
              <tr><th className="text-left py-2">Mois</th><th className="text-right py-2">Objectif</th><th className="text-right py-2">Réalisé</th><th className="text-right py-2">Écart</th></tr>
            </thead>
            <tbody>
              {data.yearSeries.map((m) => {
                const ecart = m.realized - m.objective;
                const good = ecart >= 0;
                return (
                  <tr key={m.month} className="border-t border-border">
                    <td className="py-2 capitalize">{MONTHS[m.month - 1]}</td>
                    <td className="py-2 text-right tabular-nums text-ink-soft">{eur0(m.objective)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{eur0(m.realized)}</td>
                    <td className="py-2 text-right tabular-nums font-medium" style={{ color: m.objective > 0 ? (good ? GREEN : RED) : undefined }}>
                      {m.objective > 0 ? `${good ? '+' : ''}${eur0(ecart)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ Gear modal ---- */

function GearModal({
  storeId, storeName, year, month, objectiveMonth, weights, onClose, onSaved,
}: {
  storeId: string; storeName: string; year: number; month: number;
  objectiveMonth: number; weights: number[];
  onClose: () => void; onSaved: () => void;
}) {
  const [obj, setObj] = useState(objectiveMonth ? String(objectiveMonth) : '');
  const [w, setW] = useState<number[]>(() => Array.from({ length: 7 }, (_, i) => Number(weights[i] ?? (i === 6 ? 0 : 1))));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setDay(i: number, open: boolean, weight?: number) {
    setW((cur) => cur.map((v, idx) => idx === i ? (open ? (weight ?? (v > 0 ? v : 1)) : 0) : v));
  }

  async function save() {
    setSaving(true); setErr(null);
    try {
      const objNum = Number(String(obj).replace(',', '.')) || 0;
      const [r1, r2] = await Promise.all([
        fetch('/api/analytics/targets', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, month, targets: { [storeId]: objNum } }),
        }),
        fetch('/api/analytics/objectives/schedule', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, weights: w }),
        }),
      ]);
      if (!r1.ok || !r2.ok) { setErr('Enregistrement impossible.'); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5 max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Réglages objectifs — {storeName}</h2>
          <button onClick={onClose} aria-label="Fermer" className="h-9 w-9 grid place-items-center rounded-lg text-ink-soft hover:bg-gray-100">✕</button>
        </div>

        <label className="block text-sm">
          <span className="text-ink-soft">Objectif du mois ({MONTHS[month - 1]} {year}) — TTC</span>
          <input type="number" min={0} step="0.01" inputMode="decimal" className="input mt-1 h-11 text-lg" value={obj} onChange={(e) => setObj(e.target.value)} placeholder="0" />
        </label>

        <div className="mt-4">
          <div className="text-sm text-ink-soft mb-2">Semaine-type : jours d&apos;ouverture et poids (le samedi peut peser plus qu&apos;un mardi). Un jour fermé n&apos;a pas d&apos;objectif.</div>
          <div className="space-y-1.5">
            {WD_LONG.map((label, i) => {
              const open = w[i]! > 0;
              return (
                <div key={label} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-32 text-sm">
                    <input type="checkbox" checked={open} onChange={(e) => setDay(i, e.target.checked)} />
                    {label}
                  </label>
                  <input type="number" min={0} step="0.1" disabled={!open}
                    className="input h-9 w-24 text-right tabular-nums disabled:opacity-40"
                    value={open ? String(w[i]) : ''}
                    onChange={(e) => setDay(i, true, Math.max(0, Number(e.target.value) || 0))}
                    placeholder="poids" />
                  <span className="text-xs text-ink-soft">{open ? 'poids' : 'fermé'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {err && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost h-10 px-4">Annuler</button>
          <button onClick={() => void save()} disabled={saving} className="btn-primary h-10 px-4 font-semibold disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
