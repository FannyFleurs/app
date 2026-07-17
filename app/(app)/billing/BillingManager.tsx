'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface CustomerRow {
  id: string;
  name: string;
  account_balance: number;
  uninvoiced_count: number;
  pending_invoices: number;
  pending_ttc: number;
}
interface SaleRow {
  id: string;
  receipt_number: string | null;
  validated_at: string | null;
  total_ttc: number;
  deferred_amount: number;
}
interface InvoiceRow {
  id: string;
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_ttc: number;
  status: string;
}
interface Detail {
  customer: { id: string; name: string; account_balance: number };
  sales: SaleRow[];
  invoices: InvoiceRow[];
}

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const dateFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';

const INVOICE_STATUS: Record<string, string> = {
  validated: 'Validée', sent: 'Envoyée', partially_paid: 'Part. payée', overdue: 'En retard',
};

export default function BillingManager({ canInvoice }: { canInvoice: boolean }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sélection des tickets pour la facture de période.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Modale de règlement de facture.
  const [settling, setSettling] = useState<InvoiceRow | null>(null);
  const [settleAmount, setSettleAmount] = useState('');

  const loadCustomers = useCallback(async () => {
    const r = await fetch('/api/billing/customers');
    if (r.ok) setCustomers((await r.json()).customers as CustomerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError(null);
    const r = await fetch(`/api/billing/customers/${id}`);
    if (r.ok) {
      const d = (await r.json()) as Detail;
      setDetail(d);
      // Coche tous les tickets par défaut.
      setChecked(Object.fromEntries(d.sales.map((s) => [s.id, true])));
    } else {
      setDetail(null);
    }
    setDetailLoading(false);
  }, []);

  function select(id: string) {
    setSelectedId(id);
    setFrom(''); setTo('');
    void loadDetail(id);
  }

  // Tickets visibles selon le filtre de période.
  const visibleSales = useMemo(() => {
    if (!detail) return [];
    return detail.sales.filter((s) => {
      if (!s.validated_at) return !from && !to;
      const d = s.validated_at.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [detail, from, to]);

  const selectedSales = visibleSales.filter((s) => checked[s.id]);
  const selectedTotal = selectedSales.reduce((a, s) => a + s.total_ttc, 0);

  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  }
  function setAllVisible(v: boolean) {
    setChecked((c) => {
      const next = { ...c };
      for (const s of visibleSales) next[s.id] = v;
      return next;
    });
  }

  async function invoicePeriod() {
    if (!detail || selectedSales.length === 0) return;
    setBusy(true); setError(null);
    const r = await fetch('/api/billing/invoice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: detail.customer.id, sale_ids: selectedSales.map((s) => s.id) }),
    });
    setBusy(false);
    if (r.ok) {
      await Promise.all([loadDetail(detail.customer.id), loadCustomers()]);
    } else {
      const j = await r.json().catch(() => null);
      setError(j?.message ?? 'Échec de la facturation.');
    }
  }

  function openSettle(inv: InvoiceRow) {
    setSettling(inv);
    setSettleAmount(inv.total_ttc.toFixed(2));
    setError(null);
  }

  async function confirmSettle() {
    if (!settling || !detail) return;
    const amount = Number(settleAmount.replace(',', '.'));
    if (!(amount > 0)) { setError('Montant invalide.'); return; }
    setBusy(true); setError(null);
    const r = await fetch(`/api/invoices/${settling.id}/settle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    setBusy(false);
    if (r.ok) {
      setSettling(null);
      await Promise.all([loadDetail(detail.customer.id), loadCustomers()]);
    } else {
      const j = await r.json().catch(() => null);
      setError(j?.message ?? 'Échec du règlement.');
    }
  }

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Facturation"
          subtitle="Clients « en compte » : facturez les tickets par période et soldez les règlements."
          actions={null}
        />
      </div>

      <div className="flex-1 md:overflow-hidden grid md:grid-cols-[22rem_1fr]">
        {/* Colonne clients */}
        <aside className="border-b md:border-b-0 md:border-r border-border md:overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-ink-soft">Chargement…</p>
          ) : customers.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft">Aucun client avec un solde en compte à régler.</p>
          ) : (
            <ul className="divide-y divide-border">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => select(c.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedId === c.id ? 'bg-accent-soft/40' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{c.name}</span>
                      <span className="text-danger font-semibold tabular-nums shrink-0">{eur(c.account_balance)}</span>
                    </div>
                    <div className="mt-1 flex gap-2 text-xs text-ink-soft">
                      {c.uninvoiced_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          {c.uninvoiced_count} ticket{c.uninvoiced_count > 1 ? 's' : ''} à facturer
                        </span>
                      )}
                      {c.pending_invoices > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                          {c.pending_invoices} facture{c.pending_invoices > 1 ? 's' : ''} · {eur(c.pending_ttc)}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Détail client */}
        <section className="md:overflow-y-auto p-4 md:p-6 space-y-6">
          {!selectedId ? (
            <p className="text-sm text-ink-soft">Sélectionnez un client pour gérer sa facturation.</p>
          ) : detailLoading || !detail ? (
            <p className="text-sm text-ink-soft">Chargement…</p>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold">{detail.customer.name}</h2>
                <div className="text-sm">
                  Solde en compte :{' '}
                  <span className={detail.customer.account_balance < 0 ? 'text-danger font-semibold' : 'text-success font-semibold'}>
                    {eur(detail.customer.account_balance)}
                  </span>
                </div>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              {/* Tickets en compte non facturés */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-semibold">Tickets en compte à facturer</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <label className="flex items-center gap-1">
                      <span className="text-ink-soft">Du</span>
                      <input type="date" className="input h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-ink-soft">Au</span>
                      <input type="date" className="input h-9" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                  </div>
                </div>

                {detail.sales.length === 0 ? (
                  <p className="text-sm text-ink-soft">Aucun ticket en compte à facturer.</p>
                ) : visibleSales.length === 0 ? (
                  <p className="text-sm text-ink-soft">Aucun ticket sur cette période.</p>
                ) : (
                  <>
                    <div className="flex gap-3 text-xs">
                      <button className="text-accent-deep hover:underline" onClick={() => setAllVisible(true)}>Tout cocher</button>
                      <button className="text-accent-deep hover:underline" onClick={() => setAllVisible(false)}>Tout décocher</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-ink-soft border-b border-border">
                            <th className="py-2 pr-2 w-8"></th>
                            <th className="py-2 pr-2">Ticket</th>
                            <th className="py-2 pr-2">Date</th>
                            <th className="py-2 pr-2 text-right">Montant TTC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleSales.map((s) => (
                            <tr key={s.id} className="border-b border-border/60">
                              <td className="py-2 pr-2">
                                <input type="checkbox" className="h-4 w-4" checked={!!checked[s.id]} onChange={() => toggle(s.id)} />
                              </td>
                              <td className="py-2 pr-2 font-mono text-xs">{s.receipt_number ?? '—'}</td>
                              <td className="py-2 pr-2 text-ink-soft">{dateFr(s.validated_at)}</td>
                              <td className="py-2 pr-2 text-right tabular-nums">{eur(s.total_ttc)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm text-ink-soft">
                        {selectedSales.length} ticket{selectedSales.length > 1 ? 's' : ''} · {eur(selectedTotal)}
                      </span>
                      {canInvoice && (
                        <button
                          className="btn-primary h-10 px-4"
                          disabled={busy || selectedSales.length === 0}
                          onClick={() => void invoicePeriod()}
                        >
                          {busy ? '…' : 'Facturer la période'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Factures en attente */}
              <div className="card p-4 space-y-3">
                <h3 className="font-semibold">Factures en attente de règlement</h3>
                {detail.invoices.length === 0 ? (
                  <p className="text-sm text-ink-soft">Aucune facture en attente.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-ink-soft border-b border-border">
                          <th className="py-2 pr-2">N°</th>
                          <th className="py-2 pr-2">Émise</th>
                          <th className="py-2 pr-2">Échéance</th>
                          <th className="py-2 pr-2">Statut</th>
                          <th className="py-2 pr-2 text-right">TTC</th>
                          <th className="py-2 pl-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.invoices.map((i) => (
                          <tr key={i.id} className="border-b border-border/60">
                            <td className="py-2 pr-2 font-mono text-xs">{i.number ?? '—'}</td>
                            <td className="py-2 pr-2 text-ink-soft">{dateFr(i.issue_date)}</td>
                            <td className="py-2 pr-2 text-ink-soft">{dateFr(i.due_date)}</td>
                            <td className="py-2 pr-2">{INVOICE_STATUS[i.status] ?? i.status}</td>
                            <td className="py-2 pr-2 text-right tabular-nums font-medium">{eur(i.total_ttc)}</td>
                            <td className="py-2 pl-2 text-right">
                              <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer"
                                 className="text-accent-deep text-xs hover:underline mr-3">PDF</a>
                              {canInvoice && (
                                <button className="btn-secondary h-8 px-3 text-sm" onClick={() => openSettle(i)}>
                                  Solder
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Modale de règlement */}
      {settling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setSettling(null)}>
          <div className="card w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Solder la facture {settling.number ?? ''}</h3>
            <p className="text-sm text-ink-soft">
              Montant total : <strong>{eur(settling.total_ttc)}</strong>. Ajustez si le règlement diffère.
            </p>
            <label className="block text-sm">
              <span className="text-ink-soft">Montant réglé (€)</span>
              <input
                autoFocus
                className="input h-11 w-full mt-1 text-right tabular-nums"
                inputMode="decimal"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary h-10 px-4" disabled={busy} onClick={() => setSettling(null)}>Annuler</button>
              <button className="btn-primary h-10 px-4" disabled={busy} onClick={() => void confirmSettle()}>
                {busy ? '…' : 'Marquer comme payé'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
