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

// Date LOCALE au format aaaa-mm-jj. `toISOString()` bascule en UTC et
// décalait la date d'un jour pour les fuseaux à l'est de Greenwich (ex.
// « Cette année » démarrait au 31 déc. au lieu du 1er janv.).
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date seule, format court (« 18 sept. 2025 »). */
function shortDate(isoStr: string): string {
  return new Date(isoStr + 'T00:00:00Z').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function periodRange(p: Period, cf: string, ct: string): { from: string; to: string } {
  const now = new Date();
  // Journée en cours : la comparaison du tableau de bord se fait d'une année
  // sur l'autre, un intervalle d'un seul jour ne demande donc aucun traitement
  // particulier — il se compare au même jour l'an dernier.
  if (p === 'today') { return { from: iso(now), to: iso(now) }; }
  if (p === 'week') { const w = new Date(now); w.setDate(w.getDate() - 6); return { from: iso(w), to: iso(now) }; }
  if (p === 'month') { return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }; }
  if (p === 'prev_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  if (p === 'year') { return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }; }
  return { from: cf, to: ct };
}

export default function DashboardClient({ stores, lockedStoreId }: { stores: Store[]; lockedStoreId?: string | null }) {
  const [mode, setMode] = useState<Mode>('ttc');
  // Vue d'ouverture : la journée en cours. C'est la question qu'on se pose en
  // ouvrant le tableau de bord — « où en est-on aujourd'hui ? » —, pas le
  // cumul du mois.
  const [period, setPeriod] = useState<Period>('today');
  const today = iso(new Date());
  const [cf, setCf] = useState(today);
  const [ct, setCt] = useState(today);
  // Poste de caisse appairé : tableau de bord verrouillé sur sa boutique.
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
  // Libellé « vs … » compact : une seule date si la période comparée tient sur
  // un jour, sinon l'intervalle complet.
  const vsLabel = data
    ? (data.prevPeriod && data.prevPeriod.from === data.prevPeriod.to
        ? shortDate(data.prevPeriod.from) : data.prevLabel)
    : '';
  const categories = data?.categories ?? [];
  const empty = !!cur && cur.tickets === 0;

  const pill = (p: Period, label: string) => (
    <button
      key={p}
      onClick={() => setPeriod(p)}
      className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium transition-colors ${
        period === p ? 'accent-bar text-white' : 'bg-white border border-border text-ink-soft hover:bg-gray-50'
      }`}
    >{label}</button>
  );

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Bonjour"
        subtitle={data ? `${data.periodLabel} · comparé à ${data.prevLabel}` : 'Chargement…'}
        actions={
          <div className="inline-flex rounded-full border border-border bg-white p-0.5">
            {(['ttc', 'ht'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`h-9 px-4 rounded-full text-sm font-semibold transition-colors ${
                  mode === m ? 'accent-bar text-white' : 'text-ink-soft'
                }`}
              >{m === 'ttc' ? 'TTC' : 'HT'}</button>
            ))}
          </div>
        }
      />

      {/* Filtres période + boutique */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {pill('today', 'Aujourd\'hui')}
          {pill('week', '7 jours')}
          {pill('month', 'Ce mois')}
          {pill('prev_month', 'Mois dernier')}
          {pill('year', 'Cette année')}
          {pill('custom', 'Perso')}
        </div>
        {!lockedStoreId && stores.length > 1 && (
          <label className="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-white h-9 pl-3 pr-2 text-sm">
            <Icon name="pos" size={16} className="text-ink-soft shrink-0" />
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="bg-transparent outline-none text-ink pr-1"
            >
              <option value="">Toutes les boutiques</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" className="input h-9 w-auto" value={cf} max={ct} onChange={(e) => setCf(e.target.value)} />
          <span className="text-ink-soft">→</span>
          <input type="date" className="input h-9 w-auto" value={ct} min={cf} max={today} onChange={(e) => setCt(e.target.value)} />
        </div>
      )}

      {/* Les six chiffres de la période, sur une seule ligne : pastille, libellé,
          chiffre, comparaison à l'an dernier. */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icone="card" tone="green" label={`Chiffre d'affaires ${suffix}`}
             value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'} vsLabel={vsLabel}
             delta={delta(cur && (ht ? cur.ca_ht : cur.ca_ttc), prev && (ht ? prev.ca_ht : prev.ca_ttc))} />
        <Kpi icone="cart" tone="amber" label={`Ticket moyen ${suffix}`}
             value={cur ? formatEUR(ht ? cur.avg_ht : cur.avg_ttc) : '—'} vsLabel={vsLabel}
             delta={delta(cur && (ht ? cur.avg_ht : cur.avg_ttc), prev && (ht ? prev.avg_ht : prev.avg_ttc))} />
        <Kpi icone="invoices" tone="green" label="Nombre de tickets"
             value={cur ? String(cur.tickets) : '—'} vsLabel={vsLabel}
             delta={delta(cur?.tickets, prev?.tickets)} />
        <Kpi icone="customers" tone="neutral" label="Nombre de clients"
             value={cur ? String(cur.customers) : '—'} vsLabel={vsLabel}
             delta={delta(cur?.customers, prev?.customers)} />
        <Kpi icone="star" tone="green" label="Marge"
             value={cur ? formatEUR(cur.marge) : '—'} vsLabel={vsLabel}
             delta={delta(cur?.marge, prev?.marge)} />
        <Kpi icone="discount" tone="amber" label="Taux de marge"
             value={cur && cur.ca_ht_real > 0 ? `${((cur.marge / cur.ca_ht_real) * 100).toFixed(1).replace('.', ',')} %` : '—'}
             vsLabel={vsLabel}
             unavailable={!cur || cur.ca_ht_real <= 0}
             delta={delta(
               cur && cur.ca_ht_real > 0 ? (cur.marge / cur.ca_ht_real) * 100 : undefined,
               prev && prev.ca_ht_real > 0 ? (prev.marge / prev.ca_ht_real) * 100 : undefined,
             )} />
      </section>

      {/* Courbes CA & ticket moyen */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard icone="card" title={`Chiffre d'affaires ${suffix}`}
                   value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'} vsLabel={vsLabel}
                   delta={delta(cur && (ht ? cur.ca_ht : cur.ca_ttc), prev && (ht ? prev.ca_ht : prev.ca_ttc))}>
          {data && <LineCompare labels={data.daily.labels}
            current={ht ? data.daily.ca_ht : data.daily.ca_ttc}
            prev={ht ? data.daily.prev_ca_ht : data.daily.prev_ca_ttc}
            currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
        </ChartCard>
        <ChartCard icone="cart" title={`Ticket moyen ${suffix}`}
                   value={cur ? formatEUR(ht ? cur.avg_ht : cur.avg_ttc) : '—'} vsLabel={vsLabel}
                   delta={delta(cur && (ht ? cur.avg_ht : cur.avg_ttc), prev && (ht ? prev.avg_ht : prev.avg_ttc))}>
          {data && <LineCompare labels={data.daily.labels}
            current={ht ? data.daily.ticket_ht : data.daily.ticket_ttc}
            prev={ht ? data.daily.prev_ticket_ht : data.daily.prev_ticket_ttc}
            currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
        </ChartCard>
      </section>

      {/* Ventes par catégorie · Top produits · Moyens de paiement */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card icone="categories" title="Ventes par catégorie">
          {data && (categories.length > 0 ? (
            <AnneauPaiements parts={categories.map((c, i) => ({
              label: c.label, montant: ht ? c.ca_ht : c.ca_ttc,
              couleur: COULEURS_PAIEMENT[i % COULEURS_PAIEMENT.length]!,
            }))} />
          ) : (
            <div className="py-8"><EtatVide icone="tag" titre="Aucune donnée"
              texte="Les ventes par catégorie s'afficheront ici." /></div>
          ))}
        </Card>

        <Card icone="star" title="Top produits">
          <TopProducts rows={topProducts(data, ht)} ht={ht} />
        </Card>

        <Card icone="card" title="Répartition des moyens de paiement">
          {data && (data.payments.length > 0 ? (
            <AnneauPaiements parts={data.payments.map((p, i) => ({
              label: p.label, montant: p.amount,
              couleur: COULEURS_PAIEMENT[i % COULEURS_PAIEMENT.length]!,
            }))} />
          ) : (
            <div className="py-8"><EtatVide icone="graph" titre="Aucune donnée"
              texte="La répartition des paiements s'affichera ici." /></div>
          ))}
        </Card>
      </section>

      {/* Encouragement tant qu'aucune vente n'a été enregistrée sur la période. */}
      {empty && (
        <section className="card p-5 flex flex-wrap items-center gap-4 bg-accent-soft">
          <span className="h-11 w-11 shrink-0 rounded-full grid place-items-center bg-white text-accent-deep">
            <Icon name="sparkle" size={20} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">Un bon départ !</div>
            <div className="text-sm text-ink-soft">Vos indicateurs s'afficheront ici dès vos premières ventes.</div>
          </div>
          <a href="/reports" className="btn-primary ml-auto h-11 px-5 inline-flex items-center gap-1.5 whitespace-nowrap">
            Voir mes rapports <span aria-hidden>→</span>
          </a>
        </section>
      )}

      {/* Détail complémentaire, conservé sous le tableau de bord principal. */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card icone="calendar" title={`Chiffre d'affaires par heure ${suffix}`}>
          {data && <Bars
            labels={data.hourly.map((h) => `${String(h.hour).padStart(2, '0')}h`)}
            values={data.hourly.map((h) => ht ? h.ca_ht : h.ca_ttc)}
            labelStep={2} currentLabel={data.periodLabel} />}
        </Card>
        <Card icone="calendar" title={`Chiffre d'affaires par jour ${suffix}`}>
          {data && <Bars
            labels={data.weekday.map((w) => w.label)}
            values={data.weekday.map((w) => ht ? w.ca_ht : w.ca_ttc)}
            prev={data.weekday.map((w) => ht ? w.prev_ca_ht : w.prev_ca_ttc)}
            currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TvaCard rows={data?.tva ?? []} total={cur?.tva ?? 0} />
        <ProductTable title="Produits flop" all={sortedProducts(data, ht, 'flop')} ht={ht} />
      </section>

      {loading && <div className="text-center text-xs text-ink-soft">Actualisation…</div>}
    </div>
  );
}

/** Cinq meilleurs produits par CA. */
function topProducts(data: DashboardData | null, ht: boolean): ProductRow[] {
  if (!data) return [];
  return [...data.products]
    .sort((a, b) => (ht ? b.ca_ht : b.ca_ttc) - (ht ? a.ca_ht : a.ca_ttc))
    .slice(0, 5);
}

/** Produits triés par CA (croissant), du flop au top, ou l'inverse. */
function sortedProducts(data: DashboardData | null, ht: boolean, which: 'top' | 'flop') {
  if (!data) return [];
  const sorted = [...data.products].sort((a, b) =>
    (ht ? a.ca_ht : a.ca_ttc) - (ht ? b.ca_ht : b.ca_ttc));
  return which === 'top' ? sorted.slice().reverse() : sorted;
}

type Delta = { kind: 'pct'; pct: number; up: boolean } | { kind: 'sans-base' } | null;

function delta(cur?: number, prev?: number): Delta {
  if (cur == null || prev == null) return null;
  if (prev === 0) {
    // 0 vs 0 : on montre « 0 % » (période vide comparée à une période vide),
    // plutôt qu'une comparaison impossible. Une base à 0 avec un courant non nul
    // reste incomparable en pourcentage.
    if (cur === 0) return { kind: 'pct', pct: 0, up: false };
    return { kind: 'sans-base' };
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return { kind: 'pct', pct: Math.abs(pct), up: cur >= prev };
}

const KPI_TONE: Record<'green' | 'amber' | 'neutral', string> = {
  green: 'bg-accent-soft text-accent-deep',
  amber: 'bg-warning/10 text-warning',
  neutral: 'bg-muted text-ink-soft',
};

function Kpi({ icone, tone, label, value, delta, vsLabel, unavailable }: {
  icone: IconName; tone: 'green' | 'amber' | 'neutral'; label: string; value: string;
  delta: Delta; vsLabel: string; unavailable?: boolean;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <span className={`h-11 w-11 shrink-0 rounded-full grid place-items-center ${KPI_TONE[tone]}`}>
        <Icon name={icone} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-ink-soft truncate">{label}</div>
        <div className="text-xl font-semibold tracking-tight tabular-nums truncate" title={value}>{value}</div>
        <div className="mt-0.5 text-[11px] flex items-center gap-1 truncate">
          {unavailable ? (
            <span className="text-ink-soft">Non disponible</span>
          ) : (
            <>
              {delta?.kind === 'pct' && (
                <span className={`font-medium tabular-nums ${delta.up ? 'text-success' : 'text-danger'}`}>
                  {delta.up ? '↗' : '↘'} {delta.pct.toFixed(0)}%
                </span>
              )}
              <span className="text-ink-soft truncate">vs {vsLabel}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Petite pastille de variation, à côté du chiffre d'une carte graphique. */
function DeltaPill({ delta }: { delta: Delta }) {
  if (delta?.kind !== 'pct') {
    return <span className="rounded-full bg-muted text-ink-soft px-2 py-0.5 text-xs font-medium tabular-nums">—</span>;
  }
  const cls = delta.pct === 0
    ? 'bg-muted text-ink-soft'
    : delta.up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      {delta.pct === 0 ? '' : (delta.up ? '↗ ' : '↘ ')}{delta.pct.toFixed(0)}%
    </span>
  );
}

function TvaCard({ rows, total }: { rows: DashboardData['tva']; total: number }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">TVA collectée</h2>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{formatEUR(total)}</div>
      <div className="mt-3">
        {rows.length === 0 ? (
          <div className="py-8"><EtatVide icone="doc" titre="Aucune donnée" texte="Aucune vente à déclarer pour cette période." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-xs uppercase tracking-wider"><tr><th className="text-left py-1.5">Taux</th><th className="text-right py-1.5">Base H.T.</th><th className="text-right py-1.5">TVA</th><th className="text-right py-1.5">TTC</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.rate} className="border-t border-border"><td className="py-2 tabular-nums">{r.rate} %</td><td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(r.base_ht)}</td><td className="py-2 text-right tabular-nums whitespace-nowrap font-medium">{formatEUR(r.tva)}</td><td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(r.ttc)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Card({ icone, title, value, children }: { icone?: IconName; title: string; value?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        {icone && (
          <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-accent-soft text-accent-deep">
            <Icon name={icone} size={16} />
          </span>
        )}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {value && <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChartCard({ icone, title, value, delta, vsLabel, children }: {
  icone: IconName; title: string; value: string; delta: Delta; vsLabel: string; children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-accent-soft text-accent-deep">
          <Icon name={icone} size={16} />
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        <DeltaPill delta={delta} />
        <span className="text-xs text-ink-soft">vs {vsLabel}</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

type ProductRow = { label: string; qty: number; ca_ttc: number; ca_ht: number };

/** Table compacte « Top produits » : rang, libellé, quantité, CA. */
function TopProducts({ rows, ht }: { rows: ProductRow[]; ht: boolean }) {
  if (rows.length === 0) {
    return <div className="py-8"><EtatVide icone="tag" titre="Aucun produit vendu" texte="Les produits les plus vendus s'afficheront ici." /></div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-ink-soft text-xs uppercase tracking-wider">
        <tr>
          <th className="text-left py-1.5 w-6">#</th>
          <th className="text-left py-1.5">Produit</th>
          <th className="text-right py-1.5">Qté</th>
          <th className="text-right py-1.5">CA {ht ? 'HT' : 'TTC'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={p.label} className="border-t border-border">
            <td className="py-2 text-ink-soft tabular-nums">{i + 1}</td>
            <td className="py-2 pr-2 truncate max-w-[160px]">{p.label}</td>
            <td className="py-2 text-right tabular-nums">{p.qty}</td>
            <td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(ht ? p.ca_ht : p.ca_ttc)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductTable({ title, all, ht }: { title: string; all: ProductRow[]; ht: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const rows = all.slice(0, 5);
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">{title}</h2>{all.length > 5 && <button className="btn-soft text-xs h-8 px-3" onClick={() => setShowAll(true)}>Voir ({all.length})</button>}</div>
      {rows.length === 0 ? <div className="py-8"><EtatVide icone="tag" titre="Aucune donnée" texte="Aucune vente par produit pour cette période." /></div> : <ProductRows rows={rows} ht={ht} />}
      {showAll && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto" onClick={() => setShowAll(false)}><div className="card w-full max-w-2xl p-6 my-8 space-y-3" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{title} — liste complète</h2><button onClick={() => setShowAll(false)} className="text-ink-soft hover:text-ink" aria-label="Fermer">✕</button></div><div className="max-h-[70vh] overflow-auto"><ProductRows rows={all} ht={ht} /></div></div></div>}
    </section>
  );
}

function ProductRows({ rows, ht }: { rows: ProductRow[]; ht: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-ink-soft text-xs uppercase tracking-wider"><tr><th className="text-left py-1.5">Produit</th><th className="text-right py-1.5">CA {ht ? 'HT' : 'TTC'}</th><th className="text-right py-1.5">Quantité</th></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.label} className="border-t border-border"><td className="py-2 pr-2 truncate max-w-[220px]">{p.label}</td><td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(ht ? p.ca_ht : p.ca_ttc)}</td><td className="py-2 text-right tabular-nums">{p.qty}</td></tr>)}</tbody>
    </table>
  );
}
