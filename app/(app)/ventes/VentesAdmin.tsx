'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import StoreScopeSelect from '@/components/StoreScopeSelect';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';

interface Store { id: string; name: string }

interface SaleRow {
  id: string;
  receipt_number: string;
  total_ttc: string;
  total_discount: string;
  validated_at: string;
  status: string;
  cashier: string;
  customer: string | null;
  account_created_at_sale?: boolean;
  refunded_total: string;
}

interface DetailLine {
  line_index: number; label: string;
  unit_price_ttc: string; quantity: string; discount_amount: string;
  tax_rate: string; line_ht: string; line_tva: string; line_ttc: string;
}
interface DetailPayment { method: string; amount: string; reference?: string | null }
interface TvaRow { rate: number | string; base_ht: number | string; tva: number | string }
interface SaleDetail {
  sale: {
    receipt_number: string; total_ttc: string; total_ht: string; total_tva: string;
    total_discount: string; validated_at: string; status: string; fiscal_hash?: string;
    tva_breakdown?: TvaRow[] | null;
  };
  lines: DetailLine[];
  payments: DetailPayment[];
  returns?: { id: string; number: string; amount: string; status: string; created_at: string }[];
}

/** YYYY-MM-DD dans le fuseau local (pas UTC : évite le décalage de minuit). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m! - 1), d!, 12, 0, 0); // midi : insensible au DST
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m! - 1), d!, 12).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function VentesAdmin({ stores }: { stores: Store[] }) {
  const [date, setDate] = useState<string>(todayISO());
  const [storeId, setStoreId] = useState<string>('');
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [openId, setOpenId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<SaleRow | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ date });
      if (storeId) qs.set('store_id', storeId);
      const r = await fetch(`/api/sales/today?${qs.toString()}`);
      const j = r.ok ? await r.json() : { sales: [] };
      setSales((j.sales ?? []) as SaleRow[]);
    } catch {
      setSales([]);
    }
    setLoading(false);
  }, [date, storeId]);
  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) =>
      s.receipt_number.toLowerCase().includes(q)
      || (s.cashier ?? '').toLowerCase().includes(q)
      || (s.customer ?? '').toLowerCase().includes(q));
  }, [sales, search]);

  const summary = useMemo(() => {
    let total = 0;
    for (const s of sales) if (s.status === 'validated') total += Number(s.total_ttc);
    return { count: sales.length, total: Number(total.toFixed(2)) };
  }, [sales]);

  async function openSale(row: SaleRow) {
    setOpenId(row.id);
    setOpenRow(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/sales/${row.id}`);
      if (r.ok) setDetail(await r.json() as SaleDetail);
    } finally {
      setDetailLoading(false);
    }
  }
  function closeSale() { setOpenId(null); setOpenRow(null); setDetail(null); }

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Ventes"
        subtitle="Consultez les ventes d'une journée : articles vendus, remises et modes de règlement. Cliquez une vente pour le détail."
      />

      {/* Barre de contrôle : jour + boutique + recherche */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Jour</label>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setDate((d) => shiftDay(d, -1))}
              className="h-10 w-10 rounded-xl border border-border bg-white hover:bg-gray-50 text-lg leading-none"
              aria-label="Jour précédent">‹</button>
            <input type="date" value={date} max={todayISO()}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="input h-10 text-sm" />
            <button onClick={() => setDate((d) => (d >= todayISO() ? d : shiftDay(d, 1)))}
              disabled={date >= todayISO()}
              className="h-10 w-10 rounded-xl border border-border bg-white hover:bg-gray-50 text-lg leading-none disabled:opacity-40"
              aria-label="Jour suivant">›</button>
            <button onClick={() => setDate(todayISO())}
              className="h-10 px-3 rounded-xl border border-border bg-white hover:bg-gray-50 text-sm">Aujourd&apos;hui</button>
          </div>
        </div>

        {stores.length > 1 && (
          <StoreScopeSelect
            stores={[{ id: '', name: 'Toutes les boutiques' }, ...stores]}
            value={storeId}
            onChange={setStoreId}
          />
        )}

        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-ink-soft mb-1">Rechercher</label>
          <input
            className="input h-10 text-sm w-full"
            placeholder="N° ticket, vendeur, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="ml-auto text-right">
          <div className="text-xs text-ink-soft">{longDate(date)}</div>
          <div className="text-sm font-semibold tabular-nums">
            {summary.count} vente{summary.count > 1 ? 's' : ''} · {formatEUR(summary.total)}
          </div>
        </div>
      </div>

      {/* Liste des ventes */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Ticket</th>
              <th className="text-left px-4 py-3 font-semibold">Vente</th>
              <th className="text-left px-4 py-3 font-semibold">Vendeur</th>
              <th className="text-right px-4 py-3 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-soft">Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-soft">
                {search ? 'Aucune vente ne correspond à la recherche.' : 'Aucune vente enregistrée pour cette journée.'}
              </td></tr>
            ) : filtered.map((s) => {
              const cancelled = s.status === 'cancelled_by_credit_note';
              const refunded = Number(s.refunded_total);
              return (
                <tr key={s.id}
                    onClick={() => void openSale(s)}
                    className="border-t border-border cursor-pointer hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{s.receipt_number}</span>
                      {cancelled && <Badge tone="danger">Annulée</Badge>}
                      {!cancelled && refunded > 0 && <Badge tone="warning">Retour −{formatEUR(refunded)}</Badge>}
                    </div>
                    <div className="text-[11px] text-ink-soft mt-0.5 tabular-nums">
                      {new Date(s.validated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span>{s.customer ?? '—'}</span>
                      {s.account_created_at_sale && <Badge tone="soft">Nouveau</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.cashier}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${cancelled ? 'line-through text-ink-soft' : ''}`}>
                    {formatEUR(Number(s.total_ttc))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && (
        <SaleDetailModal
          row={openRow}
          detail={detail}
          loading={detailLoading}
          onClose={closeSale}
        />
      )}
    </div>
  );
}

function SaleDetailModal({ row, detail, loading, onClose }: {
  row: SaleRow | null;
  detail: SaleDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const paymentsByMethod = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of detail?.payments ?? []) m.set(p.method, (m.get(p.method) ?? 0) + Number(p.amount));
    return [...m.entries()];
  }, [detail]);

  const s = detail?.sale;
  const cancelled = (s?.status ?? row?.status) === 'cancelled_by_credit_note';
  const tva = Array.isArray(s?.tva_breakdown) ? s!.tva_breakdown! : [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto"
         onClick={onClose}>
      <div className="card w-full max-w-3xl p-6 my-8" onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold font-mono">{row?.receipt_number ?? s?.receipt_number}</h2>
              {cancelled && <Badge tone="danger">Annulée</Badge>}
            </div>
            <p className="text-sm text-ink-soft mt-0.5">
              {s?.validated_at
                ? new Date(s.validated_at).toLocaleString('fr-FR')
                : row ? new Date(row.validated_at).toLocaleString('fr-FR') : ''}
              {row?.cashier ? ` · ${row.cashier}` : ''}
              {row?.customer ? ` · ${row.customer}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none" aria-label="Fermer">✕</button>
        </div>

        {loading || !detail ? (
          <div className="py-10 text-center text-sm text-ink-soft">Chargement du détail…</div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Articles */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                  <tr>
                    <th className="text-left py-2 font-semibold">Article</th>
                    <th className="text-right py-2 font-semibold">Qté</th>
                    <th className="text-right py-2 font-semibold">PU TTC</th>
                    <th className="text-right py-2 font-semibold">Remise</th>
                    <th className="text-right py-2 font-semibold">TVA</th>
                    <th className="text-right py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l) => {
                    const disc = Number(l.discount_amount);
                    return (
                      <tr key={l.line_index} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-2">{l.label}</td>
                        <td className="py-2 text-right tabular-nums">{Number(l.quantity)}</td>
                        <td className="py-2 text-right tabular-nums">{formatEUR(Number(l.unit_price_ttc))}</td>
                        <td className={`py-2 text-right tabular-nums ${disc > 0 ? 'text-warning' : 'text-ink-soft'}`}>
                          {disc > 0 ? `−${formatEUR(disc)}` : '—'}
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink-soft">{Number(l.tax_rate)}%</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{formatEUR(Number(l.line_ttc))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Récapitulatif */}
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-2">Récapitulatif</h3>
                {tva.length > 0 && (
                  <div className="mb-2 space-y-0.5">
                    {tva.map((t, i) => (
                      <div key={i} className="flex justify-between text-xs text-ink-soft tabular-nums">
                        <span>TVA {Number(t.rate)}% (base {formatEUR(Number(t.base_ht))})</span>
                        <span>{formatEUR(Number(t.tva))}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-sm tabular-nums"><span className="text-ink-soft">Total HT</span><span>{formatEUR(Number(s?.total_ht ?? 0))}</span></div>
                <div className="flex justify-between text-sm tabular-nums"><span className="text-ink-soft">Total TVA</span><span>{formatEUR(Number(s?.total_tva ?? 0))}</span></div>
                {Number(s?.total_discount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm tabular-nums text-warning"><span>Remises</span><span>−{formatEUR(Number(s?.total_discount))}</span></div>
                )}
                <div className="flex justify-between text-base font-semibold tabular-nums mt-1.5 pt-1.5 border-t border-border">
                  <span>Total TTC</span><span>{formatEUR(Number(s?.total_ttc ?? 0))}</span>
                </div>
              </div>

              {/* Modes de règlement */}
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-2">Modes de règlement</h3>
                {paymentsByMethod.length === 0 ? (
                  <p className="text-sm text-ink-soft">Aucun paiement enregistré.</p>
                ) : (
                  <div className="space-y-1.5">
                    {paymentsByMethod.map(([method, amount]) => (
                      <div key={method} className="flex items-center justify-between">
                        <Badge tone="soft">{PAYMENT_LABELS[method] ?? method}</Badge>
                        <span className="text-sm font-semibold tabular-nums">{formatEUR(amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(detail.returns ?? []).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <h3 className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-2">Retours / avoirs</h3>
                    <div className="space-y-1">
                      {detail.returns!.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-xs">
                          <span className="text-ink-soft">{r.number}</span>
                          <span className="font-semibold tabular-nums text-warning">−{formatEUR(Number(r.amount))}</span>
                        </div>
                      ))}
                    </div>
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
