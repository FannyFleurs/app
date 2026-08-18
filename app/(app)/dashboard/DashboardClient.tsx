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

export default function DashboardClient({ firstName, stores, lockedStoreId }: { firstName: string; stores: Store[]; lockedStoreId?: string | null }) {
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
        title={`Bonjour ${firstName}`}
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
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="input h-9 w-auto text-sm"
          >
            <option value="">Toutes les boutiques</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" className="input h-9 w-auto" value={cf} max={ct} onChange={(e) => setCf(e.target.value)} />
          <span className="text-ink-soft">→</span>
          <input type="date" className="input h-9 w-auto" value={ct} min={cf} max={today} onChange={(e) => setCt(e.target.value)} />
        </div>
      )}

      {/* Les six chiffres de la période, dans les tuiles de « Ma journée » :
          pastille, libellé, chiffre, comparaison. La première est pleine —
          c'est le chiffre qu'on vient chercher. */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi icone="card" pleine label={`Chiffre d'affaires ${suffix}`}
             value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'}
             delta={delta(cur && (ht ? cur.ca_ht : cur.ca_ttc), prev && (ht ? prev.ca_ht : prev.ca_ttc))} />
        <Kpi icone="stock" label={`Ticket moyen ${suffix}`}
             value={cur ? formatEUR(ht ? cur.avg_ht : cur.avg_ttc) : '—'}
             delta={delta(cur && (ht ? cur.avg_ht : cur.avg_ttc), prev && (ht ? prev.avg_ht : prev.avg_ttc))} />
        <Kpi icone="invoices" label="Nombre de tickets"
             value={cur ? String(cur.tickets) : '—'}
             delta={delta(cur?.tickets, prev?.tickets)} />
        <Kpi icone="customers" label="Nombre de clients"
             value={cur ? String(cur.customers) : '—'}
             delta={delta(cur?.customers, prev?.customers)} />
        <Kpi icone="star" label="Marge"
             value={cur ? formatEUR(cur.marge) : '—'}
             delta={delta(cur?.marge, prev?.marge)} />
        <Kpi icone="star" label="Taux de marge"
             value={cur && cur.ca_ht > 0 ? `${((cur.marge / cur.ca_ht) * 100).toFixed(1).replace('.', ',')} %` : '—'}
             delta={delta(
               cur && cur.ca_ht > 0 ? (cur.marge / cur.ca_ht) * 100 : undefined,
               prev && prev.ca_ht > 0 ? (prev.marge / prev.ca_ht) * 100 : undefined,
             )} />
      </section>

      {/* Courbes CA & ticket moyen */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title={`Chiffre d'affaires ${suffix}`} value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'}>
          {data && <LineCompare labels={data.daily.labels}
            current={ht ? data.daily.ca_ht : data.daily.ca_ttc}
            prev={ht ? data.daily.prev_ca_ht : data.daily.prev_ca_ttc}
            currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
        </Card>
        <Card title={`Ticket moyen ${suffix}`} value={cur ? formatEUR(ht ? cur.avg_ht : cur.avg_ttc) : '—'}>
          {data && <LineCompare labels={data.daily.labels}
            current={ht ? data.daily.ticket_ht : data.daily.ticket_ttc}
            prev={ht ? data.daily.prev_ticket_ht : data.daily.prev_ticket_ttc}
            currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
        </Card>
      </section>

      {/* CA par heure & par jour */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title={`Chiffre d'affaires par heure ${suffix}`} value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'}>
          {data && <Bars
            labels={data.hourly.map((h) => `${String(h.hour).padStart(2, '0')}h`)}
            values={data.hourly.map((h) => ht ? h.ca_ht : h.ca_ttc)}
            labelStep={2} currentLabel={data.periodLabel} />}
        </Card>
        <Card title={`Chiffre d'affaires par jour ${suffix}`} value={cur ? formatEUR(ht ? cur.ca_ht : cur.ca_ttc) : '—'}>
          {data && <Bars
            labels={data.weekday.map((w) => w.label)}
            values={data.weekday.map((w) => ht ? w.ca_ht : w.ca_ttc)}
            prev={data.weekday.map((w) => ht ? w.prev_ca_ht : w.prev_ca_ttc)}
            currentLabel={data.periodLabel} prevLabel={data.prevLabel} />}
        </Card>
      </section>

      {/* Moyens de paiement & TVA */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Répartition des ventes">
          {data && (data.payments.length > 0 ? (
            <AnneauPaiements parts={data.payments.map((p, i) => ({
              label: p.label, montant: p.amount,
              couleur: COULEURS_PAIEMENT[i % COULEURS_PAIEMENT.length]!,
            }))} />
          ) : (
            <div className="py-8">
              <EtatVide icone="graph" titre="Aucun encaissement"
                        texte="Aucun règlement enregistré sur cette période." />
            </div>
          ))}
        </Card>
        {/* La TVA était calculée par l'API et jetée : la page n'en montrait que
            le total. Le détail par taux est ce qu'on recopie sur la
            déclaration — il a plus sa place ici qu'un camembert. */}
        <TvaCard rows={data?.tva ?? []} total={cur?.tva ?? 0} />
      </section>

      {/* Top / flop produits */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ProductTable title="Top produits" rows={topRows(data, ht, 'top')} ht={ht} />
        <ProductTable title="Produits flop" rows={topRows(data, ht, 'flop')} ht={ht} />
      </section>

      {loading && <div className="text-center text-xs text-ink-soft">Actualisation…</div>}
    </div>
  );
}

function topRows(data: DashboardData | null, ht: boolean, which: 'top' | 'flop') {
  if (!data) return [];
  const sorted = [...data.products].sort((a, b) =>
    (ht ? a.ca_ht : a.ca_ttc) - (ht ? b.ca_ht : b.ca_ttc));
  return which === 'top' ? sorted.slice().reverse().slice(0, 5) : sorted.slice(0, 5);
}

/**
 * Évolution par rapport à la même période l'an dernier.
 *
 * Trois états, et pas deux : la comparaison n'existe pas encore (rien n'est
 * chargé), elle n'a pas de base (l'an dernier valait zéro — un pourcentage
 * serait une division par zéro), ou elle se calcule. Le deuxième cas était
 * rendu comme le premier : le coin de la tuile restait vide, et on ne savait
 * pas si le chiffre manquait ou s'il n'y avait rien à comparer.
 */
type Delta = { kind: 'pct'; pct: number; up: boolean } | { kind: 'sans-base' } | null;

function delta(cur?: number, prev?: number): Delta {
  if (cur == null || prev == null) return null;
  if (prev === 0) return { kind: 'sans-base' };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return { kind: 'pct', pct: Math.abs(pct), up: cur >= prev };
}

/**
 * Tuile d'indicateur, dans la présentation de « Ma journée » : pastille à
 * gauche, libellé, chiffre, comparaison en dessous.
 *
 * La comparaison est la ligne de note. Elle garde sa couleur — vert si ça
 * monte, rouge si ça descend —, contrairement au comptoir qui la laisse en
 * gris : ici l'écran sert justement à lire une évolution.
 */
function Kpi({ icone, label, value, delta, pleine }: {
  icone: IconName; label: string; value: string; delta: Delta; pleine?: boolean;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span
        className={`h-11 w-11 shrink-0 rounded-full grid place-items-center ${
          pleine ? 'text-white' : 'bg-muted text-accent-deep'
        }`}
        style={pleine ? { backgroundColor: 'var(--primary)' } : undefined}
      >
        <Icon name={icone} size={20} />
      </span>
      {/* flex-1 : sans lui la colonne se fait écraser par la pastille et le
          montant se coupe dès qu'on descend sous le grand écran. */}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-ink-soft truncate">{label}</div>
        <div className="text-xl font-semibold tracking-tight tabular-nums truncate" title={value}>
          {value}
        </div>
        <div className="text-[11px] truncate">
          {delta?.kind === 'pct' && (
            <span className={`font-medium tabular-nums ${delta.up ? 'text-success' : 'text-danger'}`}>
              {delta.up ? '↑' : '↓'} {delta.pct.toFixed(0)}% vs l&apos;an dernier
            </span>
          )}
          {delta?.kind === 'sans-base' && (
            <span
              className="text-ink-soft"
              title="Rien à comparer : la période équivalente de l'an dernier est vide."
            >
              — rien à comparer
            </span>
          )}
          {delta === null && <span className="text-ink-soft">&nbsp;</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * TVA collectée, ventilée par taux : la base H.T., la taxe, et le TTC.
 *
 * Une boutique qui ajoute un taux le voit apparaître sans intervention —
 * les lignes viennent des ventes de la période, pas d'une liste figée.
 */
function TvaCard({ rows, total }: { rows: DashboardData['tva']; total: number }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">TVA collectée</h2>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{formatEUR(total)}</div>
      <div className="mt-3">
        {rows.length === 0 ? (
          <div className="py-8">
            <EtatVide icone="doc" titre="Aucune donnée"
                      texte="Aucune vente à déclarer pour cette période." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-1.5">Taux</th>
                <th className="text-right py-1.5">Base H.T.</th>
                <th className="text-right py-1.5">TVA</th>
                <th className="text-right py-1.5">TTC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rate} className="border-t border-border">
                  <td className="py-2 tabular-nums">{r.rate} %</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(r.base_ht)}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap font-medium">{formatEUR(r.tva)}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(r.ttc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Carte de graphique : titre en gras, chiffre de tête, dessin. */
function Card({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {value && <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProductTable({ title, rows, ht }: {
  title: string;
  rows: { label: string; qty: number; ca_ttc: number; ca_ht: number }[];
  ht: boolean;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      {rows.length === 0 ? (
        <div className="py-8">
          <EtatVide icone="tag" titre="Aucune donnée"
                    texte="Aucune vente par produit pour cette période." />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-ink-soft text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-1.5">Produit</th>
              <th className="text-right py-1.5">CA {ht ? 'HT' : 'TTC'}</th>
              <th className="text-right py-1.5">Quantité</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.label} className="border-t border-border">
                <td className="py-2 pr-2 truncate max-w-[220px]">{p.label}</td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">{formatEUR(ht ? p.ca_ht : p.ca_ttc)}</td>
                <td className="py-2 text-right tabular-nums">{p.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
