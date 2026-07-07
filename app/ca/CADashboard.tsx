'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

interface Store { id: string; name: string }
interface Summary {
  period: { from: string; to: string };
  ca_ttc: number; ca_ht: number; tva: number; discount: number;
  marge_ht: number; marge_pct: number; cost_ht: number;
  tickets_count: number; avg_ticket_ttc: number; max_ticket_ttc: number;
  customers_count: number; items_sold: number; unique_products_sold: number;
}
interface Product {
  product_id: string | null; product_name: string;
  category_name: string | null;
  quantity: number; ca_ttc: number; ca_ht: number;
  cost_ht: number; marge_ht: number; marge_pct: number;
}
interface Vendor {
  user_id: string; full_name: string;
  tickets_count: number; ca_ttc: number; ca_ht: number; avg_ticket_ttc: number;
}

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type SortKey = 'ca_ttc' | 'quantity' | 'marge_ht' | 'product_name';
type SortOrder = 'asc' | 'desc';

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
  stores, orgName, user,
}: {
  stores: Store[]; orgName: string;
  user: { fullName: string; email: string };
}) {
  const [storeId, setStoreId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('today');
  const today = new Date().toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const range = useMemo(
    () => periodDates(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('ca_ttc');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const reload = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (storeId) qs.set('store_id', storeId);
    try {
      const [rS, rP, rV] = await Promise.all([
        fetch(`/api/ca/summary?${qs.toString()}`),
        fetch(`/api/ca/products?${qs.toString()}&sort=${sortKey}&order=${sortOrder}&limit=200`),
        fetch(`/api/ca/vendors?${qs.toString()}`),
      ]);
      if (rS.ok) setSummary(await rS.json());
      if (rP.ok) setProducts((await rP.json()).products);
      if (rV.ok) setVendors((await rV.json()).vendors);
      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, storeId, sortKey, sortOrder]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void reload(); }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, reload]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder(key === 'product_name' ? 'asc' : 'desc'); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/ca/login');
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">Chiffre d&apos;affaires</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">{orgName}</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            {refreshedAt
              ? `Mis à jour à ${refreshedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Chargement…'}
            {loading && ' · actualisation…'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-soft hidden sm:inline">{user.fullName}</span>
          <button
            onClick={() => void logout()}
            className="btn-ghost text-sm h-10 px-3"
          >
            Se déconnecter
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {([
            ['today', 'Aujourd\'hui'],
            ['yesterday', 'Hier'],
            ['week', '7 derniers jours'],
            ['month', 'Ce mois-ci'],
            ['custom', 'Personnalisé'],
          ] as [Period, string][]).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'accent-bar text-white'
                  : 'bg-white border border-border hover:bg-gray-50 text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input h-10" value={customFrom}
                   max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="text-ink-soft">→</span>
            <input type="date" className="input h-10" value={customTo}
                   min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}

        <div className="flex-1" />

        <select
          className="input h-10 max-w-[220px]"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">Toutes les boutiques</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Actualisation auto (30s)
        </label>

        <button
          onClick={() => void reload()}
          className="btn-soft text-sm h-10 px-4"
          disabled={loading}
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="CA TTC" value={summary ? formatEUR(summary.ca_ttc) : '—'} big />
        <Kpi label="Marge HT"
             value={summary ? formatEUR(summary.marge_ht) : '—'}
             extra={summary ? `${summary.marge_pct} %` : undefined}
             tone={summary && summary.marge_ht >= 0 ? 'success' : 'danger'} />
        <Kpi label="Panier moyen"
             value={summary ? formatEUR(summary.avg_ticket_ttc) : '—'}
             extra={summary ? `${summary.tickets_count} ticket(s)` : undefined} />
        <Kpi label="Articles vendus"
             value={summary ? String(summary.items_sold) : '—'}
             extra={summary ? `${summary.unique_products_sold} produits distincts` : undefined} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="CA HT"          value={summary ? formatEUR(summary.ca_ht) : '—'} />
        <Kpi label="TVA collectée"  value={summary ? formatEUR(summary.tva) : '—'} />
        <Kpi label="Clients uniques" value={summary ? String(summary.customers_count) : '—'} />
        <Kpi label="Plus gros ticket" value={summary ? formatEUR(summary.max_ticket_ttc) : '—'} />
      </div>

      {/* Produits */}
      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Articles vendus
          </h2>
          <span className="text-xs text-ink-soft">{products.length} article(s)</span>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
                <tr>
                  <SortHeader label="Produit"    active={sortKey === 'product_name'} order={sortOrder}
                              align="left"  onClick={() => toggleSort('product_name')} />
                  <th className="text-left px-4 py-3 hidden md:table-cell">Catégorie</th>
                  <SortHeader label="Quantité"   active={sortKey === 'quantity'} order={sortOrder}
                              align="right" onClick={() => toggleSort('quantity')} />
                  <SortHeader label="CA TTC"     active={sortKey === 'ca_ttc'} order={sortOrder}
                              align="right" onClick={() => toggleSort('ca_ttc')} />
                  <SortHeader label="Marge HT"   active={sortKey === 'marge_ht'} order={sortOrder}
                              align="right" onClick={() => toggleSort('marge_ht')} />
                  <th className="text-right px-4 py-3 hidden md:table-cell">Marge %</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={6} className="text-center px-4 py-10 text-ink-soft">Aucun article vendu sur la période.</td></tr>
                ) : products.map((p, i) => (
                  <tr key={p.product_id ?? `null-${i}`} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{p.product_name}</td>
                    <td className="px-4 py-3 text-ink-soft hidden md:table-cell">{p.category_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{formatEUR(p.ca_ttc)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${p.marge_ht >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatEUR(p.marge_ht)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-ink-soft">
                      {p.marge_pct} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Vendeurs */}
      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Ventes par vendeur
          </h2>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left  px-4 py-3">Vendeur</th>
                <th className="text-right px-4 py-3">Tickets</th>
                <th className="text-right px-4 py-3">CA TTC</th>
                <th className="text-right px-4 py-3">Panier moyen</th>
                <th className="text-right px-4 py-3">Part</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan={5} className="text-center px-4 py-10 text-ink-soft">Aucune vente sur la période.</td></tr>
              ) : vendors.map((v) => {
                const share = summary && summary.ca_ttc > 0
                  ? (v.ca_ttc / summary.ca_ttc) * 100 : 0;
                return (
                  <tr key={v.user_id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{v.full_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{v.tickets_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{formatEUR(v.ca_ttc)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEUR(v.avg_ticket_ttc)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{share.toFixed(1)} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs text-ink-soft text-center pt-4">
        Webpos · dashboard en lecture seule
      </div>
    </div>
  );
}

function Kpi({ label, value, extra, tone, big }: {
  label: string; value: string; extra?: string;
  tone?: 'success' | 'danger'; big?: boolean;
}) {
  const color =
    tone === 'success' ? 'text-success' :
    tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-widest text-ink-soft font-semibold">{label}</div>
      <div className={`font-semibold tabular-nums mt-1 leading-none ${big ? 'text-3xl md:text-4xl' : 'text-2xl'} ${color}`}>
        {value}
      </div>
      {extra && (
        <div className={`text-xs mt-1 tabular-nums ${color}`}>{extra}</div>
      )}
    </div>
  );
}

function SortHeader({
  label, active, order, align, onClick,
}: {
  label: string; active: boolean; order: SortOrder;
  align: 'left' | 'right'; onClick: () => void;
}) {
  return (
    <th className={`text-${align} px-4 py-3`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-ink transition-colors ${
          active ? 'text-ink font-semibold' : ''
        }`}
      >
        {label}
        <span className="text-[10px]">
          {active ? (order === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
