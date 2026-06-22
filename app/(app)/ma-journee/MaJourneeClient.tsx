'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';

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
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  };
  lines: {
    line_index: number; label: string;
    unit_price_ttc: string; quantity: string;
    discount_amount: string; tax_rate: string;
    line_ht: string; line_tva: string; line_ttc: string;
  }[];
  payments: { method: string; amount: string; reference: string | null }[];
}

export default function MaJourneeClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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
    let ttc = 0, ht = 0, tva = 0;
    for (const s of sales) {
      ttc += Number(s.total_ttc); ht += Number(s.total_ht); tva += Number(s.total_tva);
    }
    const avg = sales.length > 0 ? ttc / sales.length : 0;
    return { ttc, ht, tva, count: sales.length, avg };
  }, [sales]);

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Ma journée"
        subtitle="Vos ventes du jour. Cliquez sur une vente pour voir le détail complet (articles, remises, paiements)."
        actions={(
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-soft">Date</label>
            <input
              type="date"
              className="input h-9 w-auto"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Tickets" value={totals.count.toString()} />
        <Kpi label="CA TTC" value={formatEUR(totals.ttc)} />
        <Kpi label="TVA collectée" value={formatEUR(totals.tva)} />
        <Kpi label="Panier moyen" value={formatEUR(totals.avg)} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_540px] gap-5 min-h-[55vh]">
        {/* Liste */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2 px-1">
            Ventes du {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          {loading ? (
            <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
          ) : sales.length === 0 ? (
            <EmptyState
              icon="☼"
              title="Aucune vente"
              description="Aucun ticket validé pour cette date."
            />
          ) : (
            <div className="card divide-y divide-border max-h-[60vh] overflow-auto">
              {sales.map((s) => {
                const active = s.id === selected;
                return (
                  <button
                    key={s.id}
                    onClick={() => void pickSale(s.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      active ? 'bg-accent-soft' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs text-ink-soft">{s.receipt_number}</div>
                        <div className="text-sm text-ink-soft">
                          {new Date(s.validated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{s.cashier}
                          {s.customer && <> · <span className="text-ink">{s.customer}</span></>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatEUR(Number(s.total_ttc))}</div>
                        {Number(s.total_discount) > 0 && (
                          <div className="text-xs text-warning">-{formatEUR(Number(s.total_discount))}</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Détail */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2 px-1">
            Détail de la vente
          </h2>
          {!selected ? (
            <EmptyState
              icon="✦"
              title="Sélectionnez une vente"
              description="Cliquez sur un ticket pour afficher son détail : articles, remises, modes de paiement, empreinte fiscale."
            />
          ) : loadingDetail ? (
            <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
          ) : detail ? (
            <SaleDetailPanel detail={detail} />
          ) : (
            <EmptyState icon="⚠" title="Erreur de chargement" />
          )}
        </div>
      </div>
    </div>
  );
}

function SaleDetailPanel({ detail }: { detail: SaleDetail }) {
  const s = detail.sale;
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
          <a href={`/api/receipts/by-sale/${s.id}/pdf`} target="_blank" rel="noreferrer"
             className="btn-soft text-xs whitespace-nowrap" title="Imprimer le ticket">
            Voir le ticket
          </a>
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
          {detail.payments.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun paiement.</p>
          ) : (
            <ul className="space-y-2">
              {detail.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                  <div>
                    <Badge tone="soft">{PAYMENT_LABELS[p.method] ?? p.method}</Badge>
                    {p.reference && <div className="text-xs text-ink-soft mt-0.5">Réf. {p.reference}</div>}
                  </div>
                  <span className="font-medium">{formatEUR(Number(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="text-xs text-ink-soft font-mono px-1">
        Empreinte fiscale : {s.fiscal_hash?.slice(0, 32)}…
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
