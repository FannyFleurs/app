'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

interface Store { id: string; name: string }
interface Summary {
  period: { from: string; to: string };
  ca_ttc: number; ca_ht: number; tva: number; discount: number;
  marge_ht: number; marge_pct: number; cost_ht: number;
  tickets_count: number; avg_ticket_ttc: number; max_ticket_ttc: number;
  customers_count: number; items_sold: number; unique_products_sold: number;
}
interface HourBucket { hour: number; ca_ht: number; ca_ttc: number; tickets_count: number }
interface Product {
  product_id: string | null; product_name: string;
  category_name: string | null;
  quantity: number; ca_ttc: number; ca_ht: number;
  cost_ht: number; marge_ht: number; marge_pct: number;
}
interface TvaRow { rate: number; base_ht: number; tva: number; ttc: number }
interface ReturnsInfo {
  count: number;
  cancelled_sales: number;
  total: number;
  items: Array<{
    id: string; number: string; amount: string; reason: string;
    created_at: string; receipt_number: string | null;
    sale_status: string | null; store_name: string | null;
  }>;
}
interface Vendor {
  user_id: string; full_name: string;
  tickets_count: number; ca_ttc: number; ca_ht: number; avg_ticket_ttc: number;
}

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type Tab = 'xz' | 'tickets' | 'account';

function periodDates(p: Period, from: string, to: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'today')     return { from: iso(today), to: iso(today) };
  if (p === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
  if (p === 'week')      { const w = new Date(today); w.setDate(w.getDate() - 6); return { from: iso(w), to: iso(today) }; }
  if (p === 'month')     { const m = new Date(today.getFullYear(), today.getMonth(), 1); return { from: iso(m), to: iso(today) }; }
  return { from, to };
}

export default function CADashboard({
  stores, orgName, logoUrl, user,
}: {
  stores: Store[]; orgName: string; logoUrl?: string;
  user: { fullName: string; email: string };
}) {
  const [storeId, setStoreId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('today');
  const today = new Date().toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [tab, setTab] = useState<Tab>('xz');

  const range = useMemo(
    () => periodDates(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const [summary, setSummary] = useState<Summary | null>(null);
  const [hours, setHours] = useState<HourBucket[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [tva, setTva] = useState<TvaRow[]>([]);
  const [returnsInfo, setReturnsInfo] = useState<ReturnsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [showFullSales, setShowFullSales] = useState(false);

  const currentStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (storeId) qs.set('store_id', storeId);
    try {
      const [rS, rH, rP, rV, rT, rR] = await Promise.all([
        fetch(`/api/ca/summary?${qs.toString()}`),
        fetch(`/api/ca/hourly?${qs.toString()}`),
        fetch(`/api/ca/products?${qs.toString()}&sort=ca_ttc&order=desc&limit=100`),
        fetch(`/api/ca/vendors?${qs.toString()}`),
        fetch(`/api/ca/tva?${qs.toString()}`),
        fetch(`/api/ca/returns?${qs.toString()}`),
      ]);
      if (rS.ok) setSummary(await rS.json());
      if (rH.ok) setHours((await rH.json()).hours);
      if (rP.ok) setProducts((await rP.json()).products);
      if (rV.ok) setVendors((await rV.json()).vendors);
      if (rT.ok) setTva((await rT.json()).tva);
      if (rR.ok) setReturnsInfo(await rR.json());
      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, storeId]);

  useEffect(() => { void reload(); }, [reload]);

  // Pull-to-refresh : detection swipe vers le bas quand scrollY = 0.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<{ startY: number; active: boolean } | null>(null);
  const [pullDist, setPullDist] = useState(0);
  const PULL_TRIGGER = 90;

  function onTouchStart(e: React.TouchEvent) {
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return;
    const t = e.touches[0];
    if (!t) return;
    pullRef.current = { startY: t.clientY, active: true };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!pullRef.current?.active) return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) { pullRef.current = null; setPullDist(0); return; }
    const t = e.touches[0]; if (!t) return;
    const dy = t.clientY - pullRef.current.startY;
    if (dy > 0) setPullDist(Math.min(dy * 0.5, PULL_TRIGGER * 1.4));
  }
  function onTouchEnd() {
    if (!pullRef.current?.active) return;
    const shouldRefresh = pullDist >= PULL_TRIGGER;
    pullRef.current = null;
    setPullDist(0);
    if (shouldRefresh) void reload();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/ca/login');
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Barre du haut : selecteur boutique + refresh */}
      <TopBar
        currentStore={currentStore}
        stores={stores}
        orgName={orgName}
        logoUrl={logoUrl}
        onStoreChange={setStoreId}
        loading={loading}
        onRefresh={() => void reload()}
      />

      {/* Contenu scrollable + pull-to-refresh */}
      <div
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-y-auto overscroll-contain relative"
        style={{ paddingBottom: '80px' /* laisse la place a la bottom nav */ }}
      >
        {/* Indicateur pull-to-refresh */}
        {pullDist > 0 && (
          <div
            className="grid place-items-center text-xs text-ink-soft"
            style={{ height: `${pullDist}px`, transition: 'height 100ms' }}
          >
            <div className={`transition-transform ${pullDist >= PULL_TRIGGER ? 'rotate-180' : ''}`}>
              ↓
            </div>
            {pullDist >= PULL_TRIGGER ? 'Relâcher pour actualiser' : 'Tirer pour actualiser'}
          </div>
        )}

        {tab === 'xz' && (
          <XzView
            summary={summary}
            hours={hours}
            products={products}
            vendors={vendors}
            tva={tva}
            returnsInfo={returnsInfo}
            period={period}
            setPeriod={setPeriod}
            customFrom={customFrom} setCustomFrom={setCustomFrom}
            customTo={customTo} setCustomTo={setCustomTo}
            today={today}
            showFullSales={showFullSales}
            setShowFullSales={setShowFullSales}
            refreshedAt={refreshedAt}
          />
        )}
        {tab === 'tickets' && <TicketsView storeId={storeId} range={range} />}
        {tab === 'account' && (
          <AccountView user={user} onLogout={logout} />
        )}
      </div>

      {/* Bottom nav */}
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                            */
/* ------------------------------------------------------------------ */

function TopBar({
  currentStore, stores, orgName, logoUrl, onStoreChange, loading, onRefresh,
}: {
  currentStore: Store | null; stores: Store[]; orgName: string; logoUrl?: string;
  onStoreChange: (id: string) => void;
  loading: boolean; onRefresh: () => void;
}) {
  return (
    <div
      className="shrink-0 bg-white border-b border-border px-4 pb-3 flex items-center gap-3"
      // Respecte l'encoche / la barre d'état iOS (viewport-fit=cover).
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      {/* Logo, sans fond (transparent sur blanc) — hauteur fixe, largeur
          automatique pour rester lisible (logo « wordmark »). */}
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={orgName} className="h-11 w-auto max-w-[150px] object-contain shrink-0" />
      ) : (
        <div className="h-11 w-11 rounded-lg grid place-items-center shrink-0 text-white font-semibold text-lg"
             style={{ backgroundColor: 'var(--primary)' }}>
          {(orgName || 'H').charAt(0).toUpperCase()}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Identité : nom de l'enseigne en titre. */}
        <div className="font-semibold text-base leading-tight truncate">{orgName}</div>
        {/* Filtre boutique : contrôle secondaire discret et cliquable. */}
        <label className="sr-only" htmlFor="storeSel">Filtrer par boutique</label>
        <div className="relative inline-flex max-w-full items-center -ml-0.5">
          <select
            id="storeSel"
            value={currentStore?.id ?? ''}
            onChange={(e) => onStoreChange(e.target.value)}
            className="text-xs text-ink-soft bg-transparent border-none outline-none appearance-none truncate max-w-full pr-4 pl-0.5 py-0.5"
          >
            <option value="">Toutes les boutiques</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-0 text-ink-soft text-[9px]">▼</span>
        </div>
      </div>

      <button
        onClick={onRefresh}
        disabled={loading}
        aria-label="Actualiser"
        className="h-10 w-10 grid place-items-center rounded-full border border-border hover:bg-gray-50 text-ink-soft disabled:opacity-50 shrink-0"
      >
        <span className={`inline-block ${loading ? 'animate-spin' : ''}`}>↻</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* X/Z view — dashboard principal                                     */
/* ------------------------------------------------------------------ */

function XzView({
  summary, hours, products, vendors, tva, returnsInfo,
  period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, today,
  showFullSales, setShowFullSales, refreshedAt,
}: {
  summary: Summary | null;
  hours: HourBucket[];
  products: Product[];
  vendors: Vendor[];
  tva: TvaRow[];
  returnsInfo: ReturnsInfo | null;
  period: Period; setPeriod: (p: Period) => void;
  customFrom: string; setCustomFrom: (v: string) => void;
  customTo: string;   setCustomTo: (v: string) => void;
  today: string;
  showFullSales: boolean; setShowFullSales: (v: boolean) => void;
  refreshedAt: Date | null;
}) {
  const topProducts = showFullSales ? products : products.slice(0, 5);

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Filtre periode */}
      <PeriodPills
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        today={today}
      />

      {/* Hero CA */}
      <div className="rounded-2xl bg-accent-soft border border-accent/10 p-5">
        <div className="text-sm text-accent-deep/80 font-medium">Chiffre d&apos;affaires (TTC)</div>
        <div className="mt-1 text-4xl font-semibold text-accent-deep tabular-nums leading-none">
          {summary ? formatEUR(summary.ca_ttc) : '—'}
        </div>
        <div className="mt-2 text-sm text-accent-deep/70 tabular-nums">
          {summary ? `${formatEUR(summary.ca_ht)} HT` : ''}
        </div>
        {returnsInfo && returnsInfo.total > 0 && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warning/15 text-warning px-2.5 py-1 text-xs font-semibold tabular-nums">
            ↩ {formatEUR(returnsInfo.total)} de retours ({returnsInfo.count})
          </div>
        )}
      </div>

      {/* 2 KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Nb de ventes"
                  value={summary ? String(summary.tickets_count) : '—'} />
        <StatCard label="Panier moyen"
                  value={summary ? formatEUR(summary.avg_ticket_ttc) : '—'}
                  hint="TTC" />
      </div>

      {/* Marge + Articles */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Marge HT"
                  value={summary ? formatEUR(summary.marge_ht) : '—'}
                  hint={summary ? `${summary.marge_pct} %` : undefined}
                  tone={summary && summary.marge_ht >= 0 ? 'success' : 'danger'} />
        <StatCard label="Articles vendus"
                  value={summary ? String(summary.items_sold) : '—'}
                  hint={summary ? `${summary.unique_products_sold} produits` : undefined} />
      </div>

      {/* Retours & annulations — visibles à distance, avec les motifs */}
      {returnsInfo && returnsInfo.count > 0 && (
        <div className="rounded-2xl bg-white border border-warning/40 p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold">↩ Retours & annulations</h3>
            <span className="text-sm font-semibold text-warning tabular-nums">
              -{formatEUR(returnsInfo.total)}
            </span>
          </div>
          {/* Seuls les compteurs : la liste détaillée (motifs, tickets) n'est
              pas nécessaire ici. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-warning/10 px-3 py-2">
              <div className="text-xs text-ink-soft">Retours</div>
              <div className="text-xl font-semibold tabular-nums">{returnsInfo.count}</div>
            </div>
            <div className="rounded-xl bg-danger/10 px-3 py-2">
              <div className="text-xs text-ink-soft">Ventes annulées</div>
              <div className="text-xl font-semibold tabular-nums text-danger">{returnsInfo.cancelled_sales}</div>
            </div>
          </div>
        </div>
      )}

      {/* CA par heure */}
      <HourlyChart hours={hours} />

      {/* Top ventes */}
      <div className="rounded-2xl bg-white border border-border p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-semibold">Top ventes {period === 'today' ? 'du jour' : 'de la période'}</h3>
          {products.length > 5 && (
            <button
              onClick={() => setShowFullSales(!showFullSales)}
              className="text-sm text-accent-deep hover:underline"
            >
              {showFullSales ? 'Réduire' : 'Tout voir'}
            </button>
          )}
        </div>
        {topProducts.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucune vente sur la période.</p>
        ) : (
          <ol className="space-y-2">
            {topProducts.map((p, i) => (
              <li key={p.product_id ?? `x-${i}`} className="flex items-center gap-2">
                <span className="w-6 text-accent-deep font-semibold tabular-nums shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate">{p.product_name}</span>
                <span className="w-10 text-right text-ink-soft text-sm tabular-nums shrink-0">×{p.quantity}</span>
                <span className="w-24 text-right tabular-nums font-medium shrink-0">{formatEUR(p.ca_ttc)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Ventes par vendeur */}
      {vendors.length > 0 && (
        <div className="rounded-2xl bg-white border border-border p-4">
          <h3 className="font-semibold mb-3">Ventes par vendeur</h3>
          <ul className="space-y-2">
            {vendors.map((v) => {
              const share = summary && summary.ca_ttc > 0
                ? (v.ca_ttc / summary.ca_ttc) * 100 : 0;
              return (
                <li key={v.user_id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{v.full_name}</div>
                    <div className="text-xs text-ink-soft">
                      {v.tickets_count} ticket{v.tickets_count > 1 ? 's' : ''} · panier moyen {formatEUR(v.avg_ticket_ttc)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{formatEUR(v.ca_ttc)}</div>
                    <div className="text-xs text-ink-soft tabular-nums">{share.toFixed(1)} %</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Détail TVA */}
      {tva.length > 0 && (
        <div className="rounded-2xl bg-white border border-border p-4">
          <h3 className="font-semibold mb-3">Détail TVA</h3>
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-1">Taux</th>
                <th className="text-right py-1">Base HT</th>
                <th className="text-right py-1">TVA</th>
                <th className="text-right py-1">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {tva.map((t) => (
                <tr key={t.rate} className="border-t border-border">
                  <td className="py-2">{t.rate} %</td>
                  <td className="py-2 text-right tabular-nums">{formatEUR(t.base_ht)}</td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">{formatEUR(t.tva)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{formatEUR(t.ttc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-center text-xs text-ink-soft pt-2">
        {refreshedAt
          ? `Mis à jour à ${refreshedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          : ''}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint, tone }: {
  label: string; value: string; hint?: string;
  tone?: 'success' | 'danger';
}) {
  const color =
    tone === 'success' ? 'text-success' :
    tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-2xl bg-white border border-border p-4">
      <div className="text-xs text-ink-soft font-medium">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums leading-none ${color}`}>
        {value}
      </div>
      {hint && <div className={`text-xs mt-1 tabular-nums ${color}`}>{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Period filter                                                      */
/* ------------------------------------------------------------------ */

function PeriodPills({
  period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, today,
}: {
  period: Period; setPeriod: (p: Period) => void;
  customFrom: string; setCustomFrom: (v: string) => void;
  customTo: string; setCustomTo: (v: string) => void;
  today: string;
}) {
  const items: [Period, string][] = [
    ['today', 'Aujourd\'hui'],
    ['yesterday', 'Hier'],
    ['week', '7 j'],
    ['month', 'Ce mois'],
    ['custom', 'Perso'],
  ];
  return (
    <div>
      <div className="flex overflow-x-auto no-scrollbar gap-1.5">
        {items.map(([p, label]) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`shrink-0 h-9 px-3 rounded-full text-sm font-medium transition-colors ${
              period === p
                ? 'accent-bar text-white'
                : 'bg-white border border-border text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="mt-2 flex items-center gap-2">
          <input type="date" className="input h-10 flex-1" value={customFrom}
                 max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="text-ink-soft">→</span>
          <input type="date" className="input h-10 flex-1" value={customTo}
                 min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hourly chart                                                       */
/* ------------------------------------------------------------------ */

function HourlyChart({ hours }: { hours: HourBucket[] }) {
  if (hours.length === 0) return null;

  // Coercition numérique défensive : selon le driver, `hour`/`ca_ht` peuvent
  // arriver en chaîne — sans ça, la correspondance `x.hour === h` échouait pour
  // les tranches de l'après-midi (elles s'affichaient à 0 alors qu'il y a des
  // ventes), ne laissant que la première tranche visible.
  const buckets = hours.map((h) => ({ hour: Number(h.hour), value: Number(h.ca_ht) || 0 }));
  const minHour = Math.min(...buckets.map((h) => h.hour));
  const maxHour = Math.max(...buckets.map((h) => h.hour));
  const values: { hour: number; value: number }[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    const found = buckets.find((x) => x.hour === h);
    values.push({ hour: h, value: found?.value ?? 0 });
  }
  const max = Math.max(...values.map((v) => v.value), 1);
  const peak = values.reduce((a, b) => b.value > a.value ? b : a, values[0]!);

  // Grille : 4 seuils
  const gridSteps = [1, 0.75, 0.5, 0.25, 0];
  const H = 140;

  return (
    <div className="rounded-2xl bg-white border border-border p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold">CA par heure (HT)</h3>
        <span className="rounded-full bg-warning/10 text-warning px-2 py-0.5 text-xs font-medium">
          ⚡ Pic à {peak.hour}h
        </span>
      </div>
      <div className="relative" style={{ height: `${H + 20}px` }}>
        {/* Grille + valeurs Y */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {gridSteps.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-10 text-[10px] text-ink-soft tabular-nums text-right">
                {formatShort(max * s)}
              </div>
              <div className="flex-1 border-t border-border/60" />
            </div>
          ))}
        </div>
        {/* Barres */}
        <div className="absolute left-12 right-0 top-0 bottom-5 flex items-end gap-1">
          {values.map((v) => {
            const h = (v.value / max) * H;
            const isPeak = v.hour === peak.hour;
            return (
              <div
                key={v.hour}
                className="flex-1 rounded-t"
                style={{
                  // `bg-accent` n'existe pas dans le thème → les barres non-pic
                  // étaient INVISIBLES (seul le pic en bg-warning s'affichait).
                  // On utilise des couleurs définies : pic en ambre, autres en vert.
                  backgroundColor: v.value === 0
                    ? 'var(--primary)'
                    : isPeak ? '#B7791F' : 'var(--primary)',
                  height: v.value === 0 ? '2px' : `${Math.max(h, 8)}px`,
                  opacity: v.value === 0 ? 0.15 : 1,
                }}
                title={`${v.hour}h — ${formatEUR(v.value)}`}
              />
            );
          })}
        </div>
        {/* Labels X (heures) — un sur 2 pour ne pas surcharger */}
        <div className="absolute left-12 right-0 bottom-0 flex gap-1">
          {values.map((v, i) => (
            <div
              key={v.hour}
              className="flex-1 text-center text-[10px] text-ink-soft tabular-nums"
            >
              {i % 2 === 0 ? `${v.hour}h` : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatShort(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k€`;
  return `${Math.round(n)} €`;
}

/* ------------------------------------------------------------------ */
/* Tickets view (lecture seule)                                       */
/* ------------------------------------------------------------------ */

function TicketsView({ storeId, range }: { storeId: string; range: { from: string; to: string } }) {
  const [items, setItems] = useState<Array<{
    id: string; receipt_number: string; validated_at: string;
    total_ttc: string; user_full_name: string; customer_name: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      if (storeId) qs.set('store_id', storeId);
      const r = await fetch(`/api/ca/tickets?${qs.toString()}`);
      if (r.ok) setItems((await r.json()).tickets);
      setLoading(false);
    })();
  }, [storeId, range.from, range.to]);

  return (
    <div className="px-4 py-4 space-y-3">
      <h2 className="text-lg font-semibold">Tickets</h2>
      {loading ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-soft">Aucun ticket sur la période.</p>
      ) : (
        <div className="rounded-2xl bg-white border border-border overflow-hidden">
          <ul className="divide-y divide-border">
            {items.map((t) => (
              <li key={t.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm">{t.receipt_number}</div>
                  <div className="text-xs text-ink-soft truncate">
                    {new Date(t.validated_at).toLocaleString('fr-FR')}
                    {' · '}
                    {t.user_full_name}
                    {t.customer_name && ` · ${t.customer_name}`}
                  </div>
                </div>
                <div className="tabular-nums font-medium">{formatEUR(Number(t.total_ttc))}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account view                                                       */
/* ------------------------------------------------------------------ */

function AccountView({
  user, onLogout,
}: {
  user: { fullName: string; email: string };
  onLogout: () => void;
}) {
  return (
    <div className="px-4 py-4 space-y-3">
      <h2 className="text-lg font-semibold">Compte</h2>
      <div className="rounded-2xl bg-white border border-border p-5 space-y-2">
        <div>
          <div className="text-xs text-ink-soft">Utilisateur</div>
          <div className="font-medium">{user.fullName}</div>
        </div>
        <div>
          <div className="text-xs text-ink-soft">Email</div>
          <div className="font-medium">{user.email}</div>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="w-full h-12 rounded-xl bg-danger/10 text-danger font-semibold hover:bg-danger/15"
      >
        Se déconnecter
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom nav                                                         */
/* ------------------------------------------------------------------ */

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: 'xz',      label: 'X / Z',    icon: <ChartIcon /> },
    { key: 'tickets', label: 'Tickets',  icon: <TicketIcon /> },
    { key: 'account', label: 'Compte',   icon: <UserIcon /> },
  ];
  return (
    <nav
      className="shrink-0 bg-white border-t border-border flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {items.map((it) => {
        const active = tab === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`flex-1 h-16 flex flex-col items-center justify-center gap-1 transition-colors ${
              active ? 'text-accent-deep' : 'text-ink-soft'
            }`}
          >
            <span className="h-6">{it.icon}</span>
            <span className={`text-[11px] font-medium ${active ? 'font-semibold' : ''}`}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 16v-4M12 16v-8M16 16v-6" />
    </svg>
  );
}
function TicketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h10l3 4v14H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </svg>
  );
}
