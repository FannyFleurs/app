'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import type { DashboardData } from '@/lib/analytics/dashboard';
import { LineCompare, Bars } from '@/components/analytics/charts';
import { AnneauPaiements, EtatVide, COULEURS_PAIEMENT } from '@/components/analytics/hellopos';
import Icon, { type IconName } from '@/components/Icon';
import PageHeader from '@/components/PageHeader';

interface Store { id: string; name: string }
type Mode = 'ttc' | 'ht';
type Period = 'today' | 'week' | 'month' | 'prev_month' | 'year' | 'custom';

function iso(d: Date) { return d.toISOString().slice(0, 10); }

function periodRange(p: Period, cf: string, ct: string): { from: string; to: string } {
  const now = new Date();
  if (p === 'today') return { from: iso(now), to: iso(now) };
  if (p === 'week') { const w = new Date(now); w.setDate(w.getDate() - 6); return { from: iso(w), to: iso(now) }; }
  if (p === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (p === 'prev_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  if (p === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  return { from: cf, to: ct };
}

export default function DashboardClient({ firstName: _firstName, stores, lockedStoreId }: { firstName: string; stores: Store[]; lockedStoreId?: string | null }) {
  const [mode, setMode] = useState<Mode>('ttc');
  const [period, setPeriod] = useState<Period>('today');
  const today = iso(new Date());
  const [cf, setCf] = useState(today);
  const [ct, setCt] = useState(today);
  const [storeId, setStoreId] = useState(lockedStoreId ?? '');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => periodRange(period, cf, ct), [period, cf, ct]);
  const ht = mode === 'ht';
  const suffix = ht ? 'H.T.' : 'TTC';

  const reload = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (storeId) qs.set('store_id', storeId);
    try {
      const r = await fetch(`/api/analytics/dashboard?${qs.toString()}`);
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, [range.from, range.to, storeId]);

  useEffect(() => { void reload(); }, [reload]);

  const cur = data?.summary.current;
  const prev = data?.summary.prev;

  const pill = (p: Period, label: string) => (
    <button key={p} onClick={() => setPeriod(p)}
      className={`shrink-0 h-9 px-4 rounded-xl text-sm font-medium transition-all ${period === p ? 'text-white shadow-sm' : 'bg-white border border-border text-ink-soft hover:bg-muted'}`}
      style={period === p ? { backgroundColor: 'var(--primary)' } : undefined}>
      {label}
    </button>
  );

  return (
    <div className="min-h-full bg-bg p-5 md:p-7 space-y-5">
      <div className="rounded-[24px] border border-border bg-surface p-5 md:p-6 shadow-sm space-y-5">
        <PageHeader
          title="Bonjour"
          subtitle={data ? `${data.periodLabel} · comparé à ${data.prevLabel}` : 'Chargement…'}
          actions={
            <div className="inline-flex rounded-xl border border-border bg-muted p-1">
              {(['ttc', 'ht'] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`h-8 px-4 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'text-white shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                  style={mode === m ? { backgroundColor: 'var(--primary)' } : undefined}>
                  {m === 'ttc' ? 'TTC' : 'HT'}
                </button>
              ))}
            </div>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {pill('today', "Aujourd'hui")}
            {pill('week', '7 jours')}
            {pill('month', 'Ce mois')}
            {pill('prev_month', 'Mois dernier')}
            {pill('year', 'Cette année')}
            {pill('custom', 'Perso')}
          </div>
          {!lockedStoreId && stores.length > 1 && (
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
              className="input h-10 min-w-[190px] rounded-xl bg-white text-sm">
              <option value="">Toutes les boutiques</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3 w-fit">
            <input type="date" className="input h-9 w-auto bg-white" value={cf} max={ct} onChange={(e) => setCf(e.target.value)} />
            <span className="text-ink-soft">→</span>
            <input type="date" className="input h-9 w-auto bg-white" value={ct} min={cf} max={today} onChange={(e) => setCt(e.target.value)} />
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
          <Kpi icone="card" tone="green" label={`Chiffre d'affaires ${suffix}`} value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'} delta={delta(cur && (ht ? cur.ca_ht : cur.ca_ttc), prev && (ht ? prev.ca_ht : prev.ca_ttc))} />
          <Kpi icone="stock" tone="yellow" label={`Ticket moyen ${suffix}`} value={cur ? formatEUR(ht ? cur.avg_ht : cur.avg_ttc) : '—'} delta={delta(cur && (ht ? cur.avg_ht : cur.avg_ttc), prev && (ht ? prev.avg_ht : prev.avg_ttc))} />
          <Kpi icone="invoices" tone="green" label="Nombre de tickets" value={cur ? String(cur.tickets) : '—'} delta={delta(cur?.tickets, prev?.tickets)} />
          <Kpi icone="customers" tone="yellow" label="Nombre de clients" value={cur ? String(cur.customers) : '—'} delta={delta(cur?.customers, prev?.customers)} />
          <Kpi icone="star" tone="green" label="Marge" value={cur ? formatEUR(cur.marge) : '—'} delta={delta(cur?.marge, prev?.marge)} />
          <Kpi icone="star" tone="yellow" label="Taux de marge" value={cur && cur.ca_ht > 0 ? `${((cur.marge / cur.ca_ht) * 100).toFixed(1).replace('.', ',')} %` : '—'} delta={delta(cur && cur.ca_ht > 0 ? (cur.marge / cur.ca_ht) * 100 : undefined, prev && prev.ca_ht > 0 ? (prev.marge / prev.ca_ht) * 100 : undefined)} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title={`Chiffre d'affaires ${suffix}`} value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'} icone="graph">
            {data && <LineCompare labels={data.daily.labels} current={ht ? data.daily.ca_ht : data.daily.ca_ttc} prev={ht ? data.daily.prev_ca_ht : data.daily.prev_ca_ttc} currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
          </Card>
          <Card title={`Ticket moyen ${suffix}`} value={cur ? formatEUR(ht ? cur.avg_ht : cur.avg_ttc) : '—'} icone="tag">
            {data && <LineCompare labels={data.daily.labels} current={ht ? data.daily.ticket_ht : data.daily.ticket_ttc} prev={ht ? data.daily.prev_ticket_ht : data.daily.prev_ticket_ttc} currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
          </Card>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title={`Chiffre d'affaires par heure ${suffix}`} value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'} icone="graph">
            {data && <Bars labels={data.hourly.map((h) => `${String(h.hour).padStart(2, '0')}h`)} values={data.hourly.map((h) => ht ? h.ca_ht : h.ca_ttc)} labelStep={2} currentLabel={data.periodLabel} />}
          </Card>
          <Card title={`Chiffre d'affaires par jour ${suffix}`} value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'} icone="graph">
            {data && <Bars labels={data.weekday.map((w) => w.label)} values={data.weekday.map((w) => ht ? w.ca_ht : w.ca_ttc)} prev={data.weekday.map((w) => ht ? w.prev_ca_ht : w.prev_ca_ttc)} currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
          </Card>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title="Répartition des ventes" icone="card">
            {data && (data.payments.length > 0 ? <AnneauPaiements parts={data.payments.map((p, i) => ({ label: p.label, montant: p.amount, couleur: COULEURS_PAIEMENT[i % COULEURS_PAIEMENT.length]! }))} /> : <div className="py-8"><EtatVide icone="graph" titre="Aucun encaissement" texte="Aucun règlement enregistré sur cette période." /></div>)}
          </Card>
          <TvaCard rows={data?.tva ?? []} total={cur?.tva ?? 0} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ProductTable title="Top produits" all={sortedProducts(data, ht, 'top')} ht={ht} />
          <ProductTable title="Produits flop" all={sortedProducts(data, ht, 'flop')} ht={ht} />
        </section>

        {loading && <div className="text-center text-xs text-ink-soft">Actualisation…</div>}
      </div>
    </div>
  );
}

function sortedProducts(data: DashboardData | null, ht: boolean, which: 'top' | 'flop') {
  if (!data) return [];
  const sorted = [...data.products].sort((a, b) => (ht ? a.ca_ht : a.ca_ttc) - (ht ? b.ca_ht : b.ca_ttc));
  return which === 'top' ? sorted.slice().reverse() : sorted;
}

type Delta = { kind: 'pct'; pct: number; up: boolean } | { kind: 'sans-base' } | null;
function delta(cur?: number, prev?: number): Delta {
  if (cur == null || prev == null) return null;
  if (prev === 0) return { kind: 'sans-base' };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return { kind: 'pct', pct: Math.abs(pct), up: cur >= prev };
}

function Kpi({ icone, label, value, delta, tone }: { icone: IconName; label: string; value: string; delta: Delta; tone: 'green' | 'yellow' }) {
  const green = tone === 'green';
  return (
    <div className="rounded-2xl border border-border p-4 min-w-0 transition-shadow hover:shadow-sm" style={{ background: green ? 'linear-gradient(135deg, rgba(1,62,55,.10), rgba(255,255,255,.92))' : 'linear-gradient(135deg, rgba(255,239,179,.72), rgba(255,255,255,.94))' }}>
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 shrink-0 rounded-full grid place-items-center text-accent-deep" style={{ backgroundColor: green ? 'rgba(1,62,55,.12)' : 'var(--primary-soft)' }}><Icon name={icone} size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-soft truncate">{label}</div>
          <div className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums truncate" title={value}>{value}</div>
          <div className="mt-1 text-[11px] min-h-4 truncate">
            {delta?.kind === 'pct' && <span className={`font-semibold tabular-nums ${delta.up ? 'text-success' : 'text-danger'}`}>{delta.up ? '↗' : '↘'} {delta.pct.toFixed(0)}% <span className="font-normal text-ink-soft">vs l&apos;an dernier</span></span>}
            {delta?.kind === 'sans-base' && <span className="text-ink-soft">— rien à comparer</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TvaCard({ rows, total }: { rows: DashboardData['tva']; total: number }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><span className="h-8 w-8 rounded-full grid place-items-center text-accent-deep" style={{ backgroundColor: 'var(--primary-soft)' }}><Icon name="doc" size={16} /></span><h2 className="font-semibold">TVA collectée</h2></div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{formatEUR(total)}</div>
      <div className="mt-3">{rows.length === 0 ? <div className="py-8"><EtatVide icone="doc" titre="Aucune donnée" texte="Aucune vente à déclarer pour cette période." /></div> : <table className="w-full text-sm"><thead className="text-ink-soft text-xs uppercase tracking-wider"><tr><th className="text-left py-1.5">Taux</th><th className="text-right py-1.5">Base H.T.</th><th className="text-right py-1.5">TVA</th><th className="text-right py-1.5">TTC</th></tr></thead><tbody>{rows.map((r) => <tr key={r.rate} className="border-t border-border"><td className="py-2 tabular-nums">{r.rate} %</td><td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(r.base_ht)}</td><td className="py-2 text-right tabular-nums whitespace-nowrap font-medium">{formatEUR(r.tva)}</td><td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(r.ttc)}</td></tr>)}</tbody></table>}</div>
    </section>
  );
}

function Card({ title, value, children, icone }: { title: string; value?: string; children: React.ReactNode; icone?: IconName }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2">{icone && <span className="h-8 w-8 rounded-full grid place-items-center text-accent-deep" style={{ backgroundColor: 'var(--primary-soft)' }}><Icon name={icone} size={16} /></span>}<h2 className="font-semibold">{title}</h2></div>
      {value && <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

type ProductRow = { label: string; qty: number; ca_ttc: number; ca_ht: number };
function ProductTable({ title, all, ht }: { title: string; all: ProductRow[]; ht: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const rows = all.slice(0, 5);
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><span className="h-8 w-8 rounded-full grid place-items-center text-accent-deep" style={{ backgroundColor: 'var(--primary-soft)' }}><Icon name="tag" size={16} /></span><h2 className="font-semibold">{title}</h2></div>{all.length > 5 && <button className="btn-soft text-xs h-8 px-3" onClick={() => setShowAll(true)}>Voir ({all.length})</button>}</div>
      {rows.length === 0 ? <div className="py-8"><EtatVide icone="tag" titre="Aucune donnée" texte="Aucune vente par produit pour cette période." /></div> : <ProductRows rows={rows} ht={ht} />}
      {showAll && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto" onClick={() => setShowAll(false)}><div className="card w-full max-w-2xl p-6 my-8 space-y-3" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{title} — liste complète</h2><button onClick={() => setShowAll(false)} className="text-ink-soft hover:text-ink" aria-label="Fermer">✕</button></div><div className="max-h-[70vh] overflow-auto"><ProductRows rows={all} ht={ht} /></div></div></div>}
    </section>
  );
}

function ProductRows({ rows, ht }: { rows: ProductRow[]; ht: boolean }) {
  return <table className="w-full text-sm"><thead className="text-ink-soft text-xs uppercase tracking-wider"><tr><th className="text-left py-1.5">Produit</th><th className="text-right py-1.5">CA {ht ? 'HT' : 'TTC'}</th><th className="text-right py-1.5">Quantité</th></tr></thead><tbody>{rows.map((p) => <tr key={p.label} className="border-t border-border"><td className="py-2 pr-2 truncate max-w-[220px]">{p.label}</td><td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(ht ? p.ca_ht : p.ca_ttc)}</td><td className="py-2 text-right tabular-nums">{p.qty}</td></tr>)}</tbody></table>;
}
