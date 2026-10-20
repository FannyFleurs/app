'use client';

import { useEffect, useMemo } from 'react';
import Badge from '@/components/Badge';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';
import SaleNotesEditor from '@/components/SaleNotesEditor';

export interface SaleDetailRow {
  receipt_number: string;
  validated_at: string;
  status?: string;
  cashier?: string | null;
  customer?: string | null;
}

interface DetailLine {
  line_index: number; label: string;
  unit_price_ttc: string; quantity: string; discount_amount: string;
  tax_rate: string; line_ht: string; line_tva: string; line_ttc: string;
}
interface DetailPayment { method: string; label?: string | null; amount: string; reference?: string | null }
interface TvaRow { rate: number | string; base_ht: number | string; tva: number | string }
export interface SaleDetail {
  sale: {
    id: string;
    receipt_number: string; total_ttc: string; total_ht: string; total_tva: string;
    total_discount: string; validated_at: string; status: string; fiscal_hash?: string;
    tva_breakdown?: TvaRow[] | null;
    notes: string | null;
  };
  lines: DetailLine[];
  payments: DetailPayment[];
  returns?: { id: string; number: string; amount: string; status: string; created_at: string }[];
}

/**
 * Détail d'une vente en modale — partagé entre le BO Ventes et l'onglet
 * Tickets de l'app CA : même présentation (articles, récapitulatif, modes
 * de règlement, commentaire éditable) dans les deux endroits.
 */
export default function SaleDetailModal({ row, detail, loading, onClose, onNotesUpdated }: {
  row: SaleDetailRow | null;
  detail: SaleDetail | null;
  loading: boolean;
  onClose: () => void;
  onNotesUpdated: (notes: string | null) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const paymentsByMethod = useMemo(() => {
    // Groupé par (method, label) : deux modes personnalisés de même
    // catégorie générique (ex. "Carte Vitrine"/"Paiement Web", tous deux
    // "other") restent distincts plutôt que de fusionner sous "Autre".
    const m = new Map<string, { method: string; label: string | null; amount: number }>();
    for (const p of detail?.payments ?? []) {
      const key = `${p.method}|${p.label ?? ''}`;
      const cur = m.get(key) ?? { method: p.method, label: p.label ?? null, amount: 0 };
      cur.amount += Number(p.amount);
      m.set(key, cur);
    }
    return [...m.values()];
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

        {detail && (
          <div className="mt-3">
            <SaleNotesEditor saleId={detail.sale.id} notes={detail.sale.notes} onUpdated={onNotesUpdated} />
          </div>
        )}

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
                    {paymentsByMethod.map((p) => (
                      <div key={`${p.method}|${p.label ?? ''}`} className="flex items-center justify-between">
                        <Badge tone="soft">{p.label ?? PAYMENT_LABELS[p.method] ?? p.method}</Badge>
                        <span className="text-sm font-semibold tabular-nums">{formatEUR(p.amount)}</span>
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
