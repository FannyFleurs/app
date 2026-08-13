'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';

// Répartit un montant sur des poids, au centime près (plus fort reste).
function proRata(target: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return weights.map(() => 0);
  const targetCents = Math.round(target * 100);
  const raw = weights.map((w) => (w / total) * targetCents);
  const cents = raw.map((r) => Math.floor(r));
  let rem = targetCents - cents.reduce((s, c) => s + c, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && rem > 0; k++) { cents[order[k]!.i]!++; rem--; }
  return cents.map((c) => c / 100);
}

interface SaleLine {
  line_index: number;
  label: string;
  quantity: string;
  unit_price_ttc: string;
  discount_amount: string;
  tax_rate: string;
  line_ttc: string;
}

interface Props {
  saleId: string;
  receiptNumber: string;
  lines: SaleLine[];
  payments?: { method: string; amount: number }[];
  /** Quantités déjà retournées par ligne (line_index → qté) : plafonne le retour. */
  returnedByLine?: Record<number, number>;
  onClose: () => void;
  onSuccess: (creditNote: {
    id: string; number: string; amount: number;
    printed?: { printer_label: string; copies: number } | null;
  }) => void;
}

type RefundMethod = 'credit_note' | 'cash' | 'card' | 'transfer' | 'check' | 'on_account';

const REFUND_LABELS: Record<RefundMethod, string> = {
  credit_note: 'Avoir', cash: 'Espèces', card: 'Carte bancaire',
  transfer: 'Virement', check: 'Chèque', on_account: 'En compte',
};

// Mode de règlement d'origine → mode de remboursement correspondant.
function toRefundMethod(payMethod: string): RefundMethod {
  switch (payMethod) {
    case 'cash': return 'cash';
    case 'card': return 'card';
    case 'check': return 'check';
    case 'transfer': return 'transfer';
    case 'deferred': return 'on_account';
    case 'payment_link': return 'card';
    default: return 'credit_note'; // gift_card, credit_note, other…
  }
}

export default function ReturnModal({ saleId, receiptNumber, lines, payments = [], returnedByLine = {}, onClose, onSuccess }: Props) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('credit_note');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modes de règlement d'origine agrégés (montants > 0) → base du
  // remboursement multi-modes.
  const originalMethods = useMemo(() => {
    const map = new Map<RefundMethod, number>();
    for (const p of payments) {
      if (p.amount <= 0) continue;
      const m = toRefundMethod(p.method);
      map.set(m, round2((map.get(m) ?? 0) + p.amount));
    }
    return Array.from(map.entries()).map(([method, amount]) => ({ method, amount }));
  }, [payments]);
  const isMulti = originalMethods.length > 1;

  const refundAmount = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const qty = quantities[l.line_index] ?? 0;
      if (qty <= 0) continue;
      const origQty = Number(l.quantity);
      const lineTtc = Number(l.line_ttc);
      total += round2((lineTtc * qty) / origQty);
    }
    return round2(total);
  }, [quantities, lines]);

  const selectedCount = Object.values(quantities).filter((q) => q > 0).length;

  // Répartition du remboursement par mode (vente multi-règlements).
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [manualAlloc, setManualAlloc] = useState(false);
  const defaultAlloc = useMemo(() => {
    if (!isMulti || refundAmount <= 0) return {} as Record<string, number>;
    const parts = proRata(refundAmount, originalMethods.map((m) => m.amount));
    const out: Record<string, number> = {};
    originalMethods.forEach((m, i) => { out[m.method] = parts[i] ?? 0; });
    return out;
  }, [isMulti, refundAmount, originalMethods]);
  // Repart du prorata dès que le montant remboursé change (sauf saisie manuelle).
  useEffect(() => { setManualAlloc(false); }, [refundAmount]);
  useEffect(() => { if (!manualAlloc) setAlloc(defaultAlloc); }, [defaultAlloc, manualAlloc]);
  const allocSum = round2(Object.values(alloc).reduce((s, v) => s + v, 0));
  const allocOk = !isMulti || Math.abs(allocSum - refundAmount) < 0.01;

  async function submit() {
    if (selectedCount === 0) { setError('Sélectionnez au moins une ligne.'); return; }
    if (!reason.trim()) { setError('Motif obligatoire.'); return; }
    if (isMulti && !allocOk) { setError(`La répartition (${formatEUR(allocSum)}) doit égaler ${formatEUR(refundAmount)}.`); return; }
    setSubmitting(true); setError(null);
    const body: {
      lines: { line_index: number; quantity: number }[];
      reason: string;
      refund_method: RefundMethod;
      refunds?: { method: RefundMethod; amount: number }[];
    } = {
      lines: Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([line_index, q]) => ({ line_index: Number(line_index), quantity: Number(q) })),
      reason: reason.trim(),
      refund_method: isMulti ? 'credit_note' : refundMethod,
    };
    if (isMulti) {
      body.refunds = originalMethods
        .filter((m) => (alloc[m.method] ?? 0) > 0)
        .map((m) => ({ method: m.method, amount: round2(alloc[m.method]!) }));
    }
    const res = await fetch(`/api/sales/${saleId}/return`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await res.json();
    onSuccess({ id: j.credit_note_id, number: j.number, amount: j.amount, printed: j.printed ?? null });
  }

  function setQty(line_index: number, qty: number, max: number) {
    const v = Math.max(0, Math.min(max, qty));
    setQuantities((cur) => ({ ...cur, [line_index]: v }));
  }
  // Quantité restant retournable pour une ligne (origine − déjà retourné).
  function remainingFor(line: SaleLine): number {
    return Math.max(0, Number(line.quantity) - (returnedByLine[line.line_index] ?? 0));
  }

  function setAll(line: SaleLine) {
    const rem = remainingFor(line);
    setQty(line.line_index, rem, rem);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Retour produit</h2>
            <p className="text-sm text-ink-soft">Ticket {receiptNumber}</p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="space-y-2 max-h-[40vh] overflow-auto">
          {lines.map((l) => {
            const already = returnedByLine[l.line_index] ?? 0;
            const max = remainingFor(l);
            const qty = quantities[l.line_index] ?? 0;
            return (
              <div key={l.line_index} className={`rounded-xl border border-border p-3 ${max <= 0 ? 'opacity-50' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{l.label}</div>
                    <div className="text-xs text-ink-soft">
                      {Number(l.quantity)} × {formatEUR(Number(l.unit_price_ttc))} · TVA {l.tax_rate}%
                      {already > 0 && (
                        <span className="text-warning"> · {already} déjà retourné{already > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  {max <= 0 ? (
                    <span className="text-xs font-medium text-ink-soft shrink-0">Entièrement retourné</span>
                  ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setQty(l.line_index, qty - 1, max)} className="h-8 w-8 rounded-lg border border-border">-</button>
                    <input
                      type="number" min={0} max={max} step={1}
                      value={qty || ''}
                      placeholder="0"
                      className="input h-8 w-16 text-center"
                      onChange={(e) => setQty(l.line_index, Math.floor(Number(e.target.value) || 0), max)}
                    />
                    <span className="text-xs text-ink-soft">/ {max}</span>
                    <button onClick={() => setQty(l.line_index, qty + 1, max)} className="h-8 w-8 rounded-lg border border-border">+</button>
                    <button onClick={() => setAll(l)} className="text-xs text-accent-deep hover:underline ml-1">Tout</button>
                  </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3">
          <label className="text-sm font-medium text-ink-soft">Motif du retour</label>
          <textarea
            className="input mt-1 h-20"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex : article non conforme, erreur de commande…"
          />
        </div>

        {isMulti ? (
        <div className="mt-3">
          <div className="text-sm font-medium text-ink-soft mb-1">Remboursement par mode</div>
          <p className="text-xs text-ink-soft mb-2">
            Vente réglée en plusieurs modes : réparti par défaut au prorata. Ajustable.
          </p>
          <div className="space-y-2">
            {originalMethods.map((m) => (
              <div key={m.method} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{REFUND_LABELS[m.method]}</div>
                  <div className="text-xs text-ink-soft">payé {formatEUR(m.amount)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="text" inputMode="decimal"
                    className="input h-9 w-24 text-right"
                    value={(alloc[m.method] ?? 0) === 0 ? '' : String(alloc[m.method])}
                    placeholder="0,00"
                    onChange={(e) => {
                      setManualAlloc(true);
                      const v = Number(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
                      setAlloc((cur) => ({ ...cur, [m.method]: v }));
                    }}
                  />
                  <span className="text-xs text-ink-soft">€</span>
                </div>
              </div>
            ))}
          </div>
          <div className={`mt-2 text-xs ${allocOk ? 'text-ink-soft' : 'text-danger'}`}>
            Réparti : {formatEUR(allocSum)} / {formatEUR(refundAmount)}
            {!manualAlloc && ' (prorata automatique)'}
          </div>
        </div>
        ) : (
        <div className="mt-3">
          <div className="text-sm font-medium text-ink-soft mb-1">Mode de remboursement</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { kind: 'credit_note', label: 'Avoir',          desc: 'Utilisable lors d\'un prochain achat.' },
              { kind: 'cash',        label: 'Espèces',         desc: 'Sortie immédiate du tiroir-caisse.' },
              { kind: 'card',        label: 'Carte bancaire',  desc: 'Remboursement par CB (TPE séparé).' },
              { kind: 'transfer',    label: 'Virement',        desc: 'Renseignez le virement plus tard.' },
              { kind: 'check',       label: 'Chèque',          desc: 'Émission de chèque au client.' },
              { kind: 'on_account',  label: 'En compte',       desc: 'Crédite le solde du client (à régulariser).' },
            ].map((m) => (
              <label key={m.kind}
                     className={`rounded-xl border p-3 cursor-pointer ${
                       refundMethod === m.kind ? 'border-ink bg-accent-soft' : 'border-border hover:border-gray-300'
                     }`}>
                <input type="radio" name="refund" value={m.kind} className="mr-2"
                       checked={refundMethod === m.kind}
                       onChange={() => setRefundMethod(m.kind as RefundMethod)} />
                <span className="font-medium">{m.label}</span>
                <div className="text-xs text-ink-soft mt-0.5 ml-5">{m.desc}</div>
              </label>
            ))}
          </div>
        </div>
        )}

        <div className="mt-3 rounded-xl bg-gray-50 p-3 flex items-baseline justify-between">
          <span className="text-sm text-ink-soft">{selectedCount} ligne(s) à rembourser</span>
          <span className="text-2xl font-semibold text-danger">-{formatEUR(refundAmount)}</span>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={submitting || refundAmount <= 0 || !reason.trim() || !allocOk} className="btn-primary">
            {submitting ? 'Traitement…' : `Valider le retour · ${formatEUR(refundAmount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
