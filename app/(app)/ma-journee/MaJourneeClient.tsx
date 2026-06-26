'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';
import Icon from '@/components/Icon';
import ReturnModal from './ReturnModal';
import PaymentCorrectionModal from './PaymentCorrectionModal';
import AttachCustomerAfterSaleModal from './AttachCustomerAfterSaleModal';

interface Sale {
  id: string; receipt_number: string;
  total_ttc: string; total_ht: string; total_tva: string; total_discount: string;
  validated_at: string;
  fiscal_hash: string;
  cashier: string;
  customer: string | null;
}

interface SaleDetail {
  sale: Sale & {
    customer_id: string | null;
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  };
  lines: {
    line_index: number; label: string;
    unit_price_ttc: string; quantity: string;
    discount_amount: string; tax_rate: string;
    line_ht: string; line_tva: string; line_ttc: string;
  }[];
  payments: { method: string; amount: string; reference: string | null }[];
  invoice: { id: string; number: string } | null;
}

type SummaryMode = 'simple' | 'complet';

export default function MaJourneeClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<SummaryMode>('simple');

  useEffect(() => {
    setLoading(true);
    setSelected(null);
    setDetail(null);
    fetch(`/api/sales/today?date=${date}`)
      .then((r) => r.json())
      .then((j) => setSales(j.sales ?? []))
      .finally(() => setLoading(false));
  }, [date]);

  async function pickSale(id: string) {
    setSelected(id);
    setLoadingDetail(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/sales/${id}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setLoadingDetail(false);
    }
  }

  const totals = useMemo(() => {
    let ttc = 0, ht = 0, tva = 0, discount = 0;
    for (const s of sales) {
      ttc += Number(s.total_ttc); ht += Number(s.total_ht); tva += Number(s.total_tva);
      discount += Number(s.total_discount);
    }
    const avg = sales.length > 0 ? ttc / sales.length : 0;
    return { ttc, ht, tva, discount, count: sales.length, avg };
  }, [sales]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sales;
    return sales.filter((s) =>
      s.receipt_number.toLowerCase().includes(needle) ||
      s.cashier?.toLowerCase().includes(needle) ||
      s.customer?.toLowerCase().includes(needle),
    );
  }, [sales, search]);

  const dateLabel = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="grid grid-cols-[300px_1fr] h-[calc(100vh-56px)] overflow-hidden">
      {/* SIDEBAR GAUCHE — synthèse journée */}
      <aside className="border-r border-border bg-white overflow-y-auto flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">Synthèse</div>
              <div className="text-lg font-semibold tracking-tight capitalize">{dateLabel}</div>
            </div>
            <label className="inline-flex items-center cursor-pointer relative">
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-border text-ink-soft hover:bg-gray-50">
                <Icon name="my-day" size={18} />
              </span>
            </label>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
            <span className="text-ink-soft">{totals.count} vente(s) ce jour</span>
          </div>
        </div>

        {/* Switch X Simple / X Complet */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-50 p-1">
            <button
              onClick={() => setMode('simple')}
              className={`rounded-xl py-2 text-sm font-medium transition-colors ${
                mode === 'simple' ? 'bg-white shadow-sm text-ink' : 'text-ink-soft'
              }`}
            >
              X Simple
            </button>
            <button
              onClick={() => setMode('complet')}
              className={`rounded-xl py-2 text-sm font-medium transition-colors ${
                mode === 'complet' ? 'bg-white shadow-sm text-ink' : 'text-ink-soft'
              }`}
            >
              X Complet
            </button>
          </div>
        </div>

        {/* Total HT mis en avant */}
        <div className="px-5 py-6 text-center">
          <div className="inline-flex items-center gap-1 text-xs text-ink-soft">
            <Icon name="dashboard" size={14} /> CA HT
          </div>
          <div className="mt-1 text-4xl font-semibold tracking-tight">{formatEUR(totals.ht)}</div>
        </div>

        {/* KPI lignes */}
        <div className="px-5 pb-4 space-y-3">
          <KpiRow label="CA Total TTC" value={formatEUR(totals.ttc)} />
          <KpiRow label="Ventes" value={totals.count.toString()} />
          <KpiRow label="Panier moyen" value={formatEUR(totals.avg)} />
          {mode === 'complet' && (
            <>
              <KpiRow label="TVA collectée" value={formatEUR(totals.tva)} />
              <KpiRow label="Remises" value={formatEUR(totals.discount)} tone="warning" />
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Action en pied — équivalent du "Actions sur ma journée" */}
        <div className="border-t border-border p-3 bg-white sticky bottom-0">
          <a
            href="/closures"
            className="btn-primary w-full text-sm h-11"
          >
            Actions sur ma journée
          </a>
        </div>
      </aside>

      {/* CONTENU — table de tickets / détail */}
      <main className="overflow-y-auto bg-white">
        {!selected ? (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <input
                  className="input pr-9"
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-ink-soft">{filtered.length} ticket(s)</span>
              </div>
            </div>

            {loading ? (
              <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="☼"
                title="Aucune vente"
                description={sales.length === 0 ? 'Aucun ticket validé pour cette date.' : 'Aucun résultat pour cette recherche.'}
              />
            ) : (
              <div className="card overflow-hidden">
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
                    {filtered.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => void pickSale(s.id)}
                        className="border-t border-border hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="font-mono font-medium">{s.receipt_number}</div>
                          <div className="text-xs text-ink-soft">
                            {new Date(s.validated_at).toLocaleTimeString('fr-FR', {
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink-soft">
                          {s.customer ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{s.cashier}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(s.total_ttc))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6">
            <button
              onClick={() => { setSelected(null); setDetail(null); }}
              className="btn-ghost text-sm mb-3"
            >
              ‹ Retour à la liste
            </button>
            {loadingDetail ? (
              <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
            ) : detail ? (
              <SaleDetailPanel
                detail={detail}
                onInvoiceGenerated={() => void pickSale(detail.sale.id)}
              />
            ) : (
              <EmptyState icon="⚠" title="Erreur de chargement" />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function KpiRow({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
        <span className="text-ink-soft/60">?</span>
        {label}
      </span>
      <span className={`text-base font-semibold ${tone === 'warning' ? 'text-warning' : ''}`}>{value}</span>
    </div>
  );
}

function SaleDetailPanel({ detail, onInvoiceGenerated }: {
  detail: SaleDetail;
  onInvoiceGenerated: () => void;
}) {
  const s = detail.sale;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [creditNote, setCreditNote] = useState<{ id: string; number: string; amount: number } | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const paymentsByMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of detail.payments) {
      map.set(p.method, (map.get(p.method) ?? 0) + Number(p.amount));
    }
    return Array.from(map.entries())
      .filter(([, v]) => Math.abs(v) > 0.005)
      .map(([method, amount]) => ({ method, amount: Number(amount.toFixed(2)) }));
  }, [detail.payments]);

  async function generateInvoice() {
    setGenerating(true); setError(null);
    const res = await fetch(`/api/sales/${s.id}/invoice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setGenerating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Erreur');
      return;
    }
    onInvoiceGenerated();
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-sm text-ink-soft">{s.receipt_number}</div>
            <div className="text-2xl font-semibold tracking-tight">{formatEUR(Number(s.total_ttc))}</div>
            <div className="text-xs text-ink-soft mt-1">
              {new Date(s.validated_at).toLocaleString('fr-FR')}
              {' · '}Vendeur : {s.cashier}
              {s.customer && <> · Client : {s.customer}</>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <a href={`/api/receipts/by-sale/${s.id}/pdf`} target="_blank" rel="noreferrer"
               className="btn-soft text-xs whitespace-nowrap">
              Voir le ticket
            </a>
            {detail.invoice ? (
              <a href={`/api/invoices/${detail.invoice.id}/pdf`} target="_blank" rel="noreferrer"
                 className="btn-primary text-xs whitespace-nowrap">
                Facture {detail.invoice.number}
              </a>
            ) : s.customer_id ? (
              <button onClick={() => void generateInvoice()} disabled={generating}
                      className="btn-primary text-xs whitespace-nowrap">
                {generating ? 'Génération…' : 'Générer facture'}
              </button>
            ) : null}
          </div>
        </div>
        {!s.customer_id && !detail.invoice && (
          <p className="mt-3 text-xs text-ink-soft">
            Aucun client attaché — la génération de facture nécessite un client identifié.
          </p>
        )}
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
        {info && <div className="mt-2 rounded-xl bg-success/10 px-3 py-2 text-xs text-success">{info}</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setShowCorrection(true)} className="btn-soft text-sm">
            ⇄ Changer règlement
          </button>
          <button onClick={() => setShowReturn(true)} className="btn-soft text-sm text-danger">
            ↩ Retour produit
          </button>
          {!s.customer_id && (
            <button onClick={() => setShowAttach(true)} className="btn-soft text-sm">
              + Attribuer un client
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Articles ({detail.lines.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="text-ink-soft text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Article</th>
              <th className="text-right px-4 py-2">Qté</th>
              <th className="text-right px-4 py-2">PU TTC</th>
              <th className="text-right px-4 py-2">Remise</th>
              <th className="text-right px-4 py-2">TVA</th>
              <th className="text-right px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l) => (
              <tr key={l.line_index} className="border-t border-border">
                <td className="px-4 py-2">{l.label}</td>
                <td className="px-4 py-2 text-right">{l.quantity}</td>
                <td className="px-4 py-2 text-right">{formatEUR(Number(l.unit_price_ttc))}</td>
                <td className="px-4 py-2 text-right">
                  {Number(l.discount_amount) > 0
                    ? <span className="text-warning">-{formatEUR(Number(l.discount_amount))}</span>
                    : <span className="text-ink-soft">—</span>}
                </td>
                <td className="px-4 py-2 text-right text-ink-soft">{l.tax_rate}%</td>
                <td className="px-4 py-2 text-right font-medium">{formatEUR(Number(l.line_ttc))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-3">Récapitulatif TVA</h3>
          <table className="w-full text-sm">
            <tbody>
              {(s.tva_breakdown ?? []).map((b, i) => (
                <tr key={i} className="border-t border-border first:border-t-0">
                  <td className="py-2">TVA {b.rate}%</td>
                  <td className="py-2 text-right text-ink-soft">Base {formatEUR(b.base_ht)}</td>
                  <td className="py-2 text-right">{formatEUR(b.tva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 pt-3 border-t border-border space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">Total HT</span><span>{formatEUR(Number(s.total_ht))}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Total TVA</span><span>{formatEUR(Number(s.total_tva))}</span></div>
            {Number(s.total_discount) > 0 && (
              <div className="flex justify-between text-warning">
                <span>Remises totales</span><span>-{formatEUR(Number(s.total_discount))}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1 border-t border-border">
              <span className="font-semibold">Total TTC</span>
              <span className="text-xl font-semibold">{formatEUR(Number(s.total_ttc))}</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-3">Modes de règlement</h3>
          {paymentsByMethod.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun paiement.</p>
          ) : (
            <ul className="space-y-2">
              {paymentsByMethod.map((p) => (
                <li key={p.method} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                  <Badge tone="soft">{PAYMENT_LABELS[p.method] ?? p.method}</Badge>
                  <span className="font-medium">{formatEUR(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {paymentsByMethod.some((p) => p.amount > 0) && (
            <button
              onClick={() => setShowCorrection(true)}
              className="mt-3 w-full btn-ghost text-xs"
            >
              ⇄ Changer le règlement
            </button>
          )}
          {detail.payments.some((p) => Number(p.amount) < 0) && (
            <p className="mt-2 text-[11px] text-ink-soft italic">
              Une ou plusieurs corrections ont été appliquées sur cette vente.
            </p>
          )}
        </div>
      </div>

      {creditNote && (
        <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm flex items-center justify-between">
          <span>
            <span className="font-semibold text-danger">Avoir {creditNote.number}</span>
            <span className="text-ink-soft ml-2">émis pour {formatEUR(creditNote.amount)}</span>
          </span>
          <a href={`/api/credit-notes/${creditNote.id}/pdf`} target="_blank" rel="noreferrer"
             className="btn-primary text-xs">
            Télécharger l&apos;avoir
          </a>
        </div>
      )}

      <div className="text-xs text-ink-soft font-mono px-1">
        Empreinte fiscale : {s.fiscal_hash?.slice(0, 32)}…
      </div>

      {showReturn && (
        <ReturnModal
          saleId={s.id}
          receiptNumber={s.receipt_number}
          lines={detail.lines}
          onClose={() => setShowReturn(false)}
          onSuccess={(cn) => {
            setCreditNote(cn);
            setShowReturn(false);
            onInvoiceGenerated();
          }}
        />
      )}
      {showCorrection && (
        <PaymentCorrectionModal
          saleId={s.id}
          paymentsByMethod={paymentsByMethod}
          onClose={() => setShowCorrection(false)}
          onSuccess={() => {
            setShowCorrection(false);
            setInfo('Règlement corrigé. Une trace fiscale a été inscrite.');
            setTimeout(() => setInfo(null), 4000);
            onInvoiceGenerated();
          }}
        />
      )}
      {showAttach && (
        <AttachCustomerAfterSaleModal
          saleId={s.id}
          onClose={() => setShowAttach(false)}
          onSuccess={(loyalty) => {
            setShowAttach(false);
            setInfo(
              loyalty?.earned
                ? `Client attribué · +${loyalty.earned} € de fidélité crédités (solde ${loyalty.new_balance} €)`
                : 'Client attribué.',
            );
            setTimeout(() => setInfo(null), 4000);
            onInvoiceGenerated();
          }}
        />
      )}
    </div>
  );
}
