'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import StoreScopeSelect from '@/components/StoreScopeSelect';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';

interface Store { id: string; name: string }

interface Totals {
  total_discount: number; discounted_sales: number; sales: number;
  rate: number; avg_per_discounted: number;
}
interface ByReason { motif: string | null; total: number; ventes: number }
interface Row {
  id: string; receipt: string | null; date: string;
  cashier: string | null; customer: string | null; store: string | null;
  discount: number; ttc: number; rate: number; motif: string | null;
}
interface Payload { totals: Totals; by_reason: ByReason[]; rows: Row[] }

interface DetailLine {
  label: string; quantity: number; unit_price_ttc: number;
  discount_amount: number; line_ttc: number; tax_rate: number; motif: string | null;
}
interface Detail {
  sale: {
    receipt_number: string | null; validated_at: string; status: string;
    total_ht: string; total_tva: string; total_ttc: string; total_discount: string;
    cashier: string | null; customer: string | null; store: string | null;
  };
  lines: DetailLine[];
  payments: { method: string; amount: number }[];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!, 12);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}
const today = () => ymd(new Date());
function startOfMonth(offset = 0): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() + offset, 1, 12));
}
function endOfMonth(offset = 0): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0, 12));
}

type PresetKey = 'last-7' | 'last-30' | 'month' | 'prev-month';
const PRESETS: { key: PresetKey; label: string; range: () => [string, string] }[] = [
  { key: 'last-7', label: '7 jours', range: () => [shiftDays(today(), -6), today()] },
  { key: 'last-30', label: '30 jours', range: () => [shiftDays(today(), -29), today()] },
  { key: 'month', label: 'Ce mois', range: () => [startOfMonth(), today()] },
  { key: 'prev-month', label: 'Mois dernier', range: () => [startOfMonth(-1), endOfMonth(-1)] },
];

function longRange(from: string, to: string): string {
  const f = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y!, m! - 1, d!, 12).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return from === to ? f(from) : `${f(from)} → ${f(to)}`;
}

export default function RemisesClient({ stores }: { stores: Store[] }) {
  const initial = PRESETS[1]!.range();
  const [from, setFrom] = useState(initial[0]);
  const [to, setTo] = useState(initial[1]);
  const [storeId, setStoreId] = useState('');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const [openId, setOpenId] = useState<string | null>(null);

  const activePreset = useMemo(() => {
    for (const p of PRESETS) { const [f, t] = p.range(); if (f === from && t === to) return p.key; }
    return null;
  }, [from, to]);

  const load = useCallback(async () => {
    const seq = ++reqRef.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      if (storeId) qs.set('store_id', storeId);
      const r = await fetch(`/api/reports/discounts?${qs.toString()}`, { cache: 'no-store' });
      const j = r.ok ? await r.json() as Payload : null;
      if (seq === reqRef.current) setData(j);
    } catch {
      if (seq === reqRef.current) setData(null);
    } finally {
      if (seq === reqRef.current) setLoading(false);
    }
  }, [from, to, storeId]);
  useEffect(() => { void load(); }, [load]);

  function applyPreset(k: PresetKey) {
    const p = PRESETS.find((x) => x.key === k)!;
    const [f, t] = p.range();
    setFrom(f); setTo(t);
  }

  const t = data?.totals;
  const maxReason = Math.max(1, ...(data?.by_reason ?? []).map((r) => r.total));

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Remises"
        subtitle="Montant des remises accordées, taux et motifs. Cliquez une vente pour le détail."
        actions={(
          <div className="flex items-end gap-2">
            <label className="text-sm">
              <span className="block text-xs font-medium text-ink-soft mb-1">Du</span>
              <input type="date" className="input h-10" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-ink-soft mb-1">Au</span>
              <input type="date" className="input h-10" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
      />

      {/* Filtres : présélections + boutique */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => applyPreset(p.key)}
            className={`rounded-full px-3 py-1.5 text-sm border transition-colors ${
              activePreset === p.key
                ? 'accent-bar text-white border-transparent'
                : 'bg-white border-border text-ink hover:bg-gray-50'}`}>
            {p.label}
          </button>
        ))}
        <span className="text-xs text-ink-soft ml-1">{longRange(from, to)}</span>
        {stores.length > 1 && (
          <div className="ml-auto">
            <StoreScopeSelect
              stores={[{ id: '', name: 'Toutes les boutiques' }, ...stores]}
              value={storeId} onChange={setStoreId} hideLabel
            />
          </div>
        )}
      </div>

      {/* Tableau de bord */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total remises" value={t ? formatEUR(t.total_discount) : '—'} tone="warning" loading={loading} />
        <Kpi label="Taux de remise" value={t ? `${(t.rate * 100).toFixed(1)} %` : '—'} loading={loading}
             hint="Part du CA brut accordée en remise" />
        <Kpi label="Ventes remisées" value={t ? `${t.discounted_sales}${t.sales ? ` / ${t.sales}` : ''}` : '—'} loading={loading} />
        <Kpi label="Remise moyenne" value={t ? formatEUR(t.avg_per_discounted) : '—'} loading={loading}
             hint="Par vente remisée" />
      </div>

      {/* Classement par motif */}
      <div className="card p-5">
        <h3 className="font-semibold">Classement par motif</h3>
        <p className="text-sm text-ink-soft mt-0.5">
          Le motif provient des remises manuelles. Remises automatiques (client) et promos : « Sans motif ».
        </p>
        <div className="mt-4 space-y-2.5">
          {loading ? (
            <div className="text-sm text-ink-soft">Chargement…</div>
          ) : (data?.by_reason ?? []).length === 0 ? (
            <div className="text-sm text-ink-soft">Aucune remise sur la période.</div>
          ) : data!.by_reason.map((r, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium truncate">{r.motif ?? 'Sans motif'}</span>
                <span className="tabular-nums shrink-0">
                  <span className="font-semibold">{formatEUR(r.total)}</span>
                  <span className="text-ink-soft"> · {r.ventes} vente{r.ventes > 1 ? 's' : ''}</span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full accent-bar rounded-full" style={{ width: `${Math.max(3, (r.total / maxReason) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Liste des ventes remisées */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Ticket</th>
              {stores.length > 1 && <th className="text-left px-4 py-3 font-semibold">Boutique</th>}
              <th className="text-left px-4 py-3 font-semibold">Vendeur</th>
              <th className="text-left px-4 py-3 font-semibold">Motif</th>
              <th className="text-right px-4 py-3 font-semibold">Remise</th>
              <th className="text-right px-4 py-3 font-semibold">Taux</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">Chargement…</td></tr>
            ) : (data?.rows ?? []).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">Aucune vente remisée sur la période.</td></tr>
            ) : data!.rows.map((r) => (
              <tr key={r.id} onClick={() => setOpenId(r.id)}
                  className="border-t border-border cursor-pointer hover:bg-gray-50">
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                  {new Date(r.date).toLocaleDateString('fr-FR')}
                  <span className="text-ink-soft"> {new Date(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td className="px-4 py-2.5 font-mono">{r.receipt ?? '—'}</td>
                {stores.length > 1 && <td className="px-4 py-2.5 text-ink-soft">{r.store ?? '—'}</td>}
                <td className="px-4 py-2.5 text-ink-soft">{r.cashier ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {r.motif ? r.motif : <span className="text-ink-soft">Sans motif</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-warning">−{formatEUR(r.discount)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">{(r.rate * 100).toFixed(1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && <DiscountDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Kpi({ label, value, hint, tone, loading }: {
  label: string; value: string; hint?: string; tone?: 'warning'; loading?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'warning' ? 'text-warning' : 'text-ink'}`}>
        {loading ? '…' : value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-soft">{hint}</div>}
    </div>
  );
}

function DiscountDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/reports/discounts/${id}`, { cache: 'no-store' });
        if (alive && r.ok) setDetail(await r.json() as Detail);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const s = detail?.sale;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto" onClick={onClose}>
      <div className="card w-full max-w-3xl p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold font-mono">{s?.receipt_number ?? 'Vente'}</h2>
            <p className="text-sm text-ink-soft mt-0.5">
              {s ? new Date(s.validated_at).toLocaleString('fr-FR') : ''}
              {s?.cashier ? ` · ${s.cashier}` : ''}
              {s?.customer ? ` · ${s.customer}` : ''}
              {s?.store ? ` · ${s.store}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none" aria-label="Fermer">✕</button>
        </div>

        {loading || !detail ? (
          <div className="py-10 text-center text-sm text-ink-soft">Chargement du détail…</div>
        ) : (
          <div className="mt-4 space-y-5">
            {(() => {
              const motifs = [...new Set(detail.lines.filter((l) => l.discount_amount > 0 && l.motif).map((l) => l.motif as string))];
              if (motifs.length === 0) return null;
              return (
                <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-warning font-semibold mb-1">
                    Motif{motifs.length > 1 ? 's' : ''} de remise
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {motifs.map((m) => <Badge key={m} tone="warning">{m}</Badge>)}
                  </div>
                </div>
              );
            })()}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                  <tr>
                    <th className="text-left py-2 font-semibold">Article</th>
                    <th className="text-right py-2 font-semibold">Qté</th>
                    <th className="text-right py-2 font-semibold">PU TTC</th>
                    <th className="text-right py-2 font-semibold">Remise</th>
                    <th className="text-left py-2 font-semibold pl-3">Motif</th>
                    <th className="text-right py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-2">{l.label}</td>
                      <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                      <td className="py-2 text-right tabular-nums">{formatEUR(l.unit_price_ttc)}</td>
                      <td className={`py-2 text-right tabular-nums ${l.discount_amount > 0 ? 'text-warning' : 'text-ink-soft'}`}>
                        {l.discount_amount > 0 ? `−${formatEUR(l.discount_amount)}` : '—'}
                      </td>
                      <td className="py-2 pl-3 text-xs text-ink-soft">{l.motif ?? (l.discount_amount > 0 ? 'Sans motif' : '')}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{formatEUR(l.line_ttc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-2">Récapitulatif</h3>
                <div className="flex justify-between text-sm tabular-nums"><span className="text-ink-soft">Total HT</span><span>{formatEUR(Number(s?.total_ht ?? 0))}</span></div>
                <div className="flex justify-between text-sm tabular-nums"><span className="text-ink-soft">Total TVA</span><span>{formatEUR(Number(s?.total_tva ?? 0))}</span></div>
                <div className="flex justify-between text-sm tabular-nums text-warning font-medium"><span>Remises</span><span>−{formatEUR(Number(s?.total_discount ?? 0))}</span></div>
                <div className="flex justify-between text-base font-semibold tabular-nums mt-1.5 pt-1.5 border-t border-border">
                  <span>Total TTC</span><span>{formatEUR(Number(s?.total_ttc ?? 0))}</span>
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-2">Modes de règlement</h3>
                {detail.payments.length === 0 ? (
                  <p className="text-sm text-ink-soft">Aucun paiement enregistré.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Badge tone="soft">{PAYMENT_LABELS[p.method] ?? p.method}</Badge>
                        <span className="text-sm font-semibold tabular-nums">{formatEUR(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn-soft">Fermer</button>
        </div>
      </div>
    </div>
  );
}
