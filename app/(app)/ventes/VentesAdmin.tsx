'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import StoreScopeSelect from '@/components/StoreScopeSelect';
import { formatEUR } from '@/lib/services/money';
import SaleDetailModal, { type SaleDetail } from '@/components/SaleDetailModal';

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
          onNotesUpdated={(notes) => setDetail((prev) => (prev ? { ...prev, sale: { ...prev.sale, notes } } : prev))}
        />
      )}
    </div>
  );
}
