'use client';

import { useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';

type Method = 'cash' | 'card' | 'check' | 'transfer' | 'gift_card' | 'credit_note' | 'other';
const METHODS: Method[] = ['cash', 'card', 'check', 'transfer', 'gift_card', 'credit_note', 'other'];

interface SplitPayment {
  key: string; method: Method; amount: number; given_amount?: number; reference?: string;
}

interface Props {
  saleId: string;
  totalTtc: number;
  onClose: () => void;
  onValidated: (receiptId: string, receiptNumber: string) => void;
}

export default function PaymentModal({ saleId, totalTtc, onClose, onValidated }: Props) {
  const [payments, setPayments] = useState<SplitPayment[]>([
    { key: 'p1', method: 'card', amount: totalTtc },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = useMemo(
    () => round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
    [payments],
  );
  const remaining = round2(totalTtc - paid);
  const change = paid > totalTtc ? round2(paid - totalTtc) : 0;

  function update(idx: number, patch: Partial<SplitPayment>) {
    setPayments((cur) => cur.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }
  function add() {
    setPayments((cur) => [...cur, { key: `p${cur.length + 1}`, method: 'cash', amount: Math.max(0, remaining) }]);
  }
  function remove(idx: number) {
    setPayments((cur) => cur.filter((_, i) => i !== idx));
  }

  async function validate() {
    if (Math.abs(paid - totalTtc) > 0.005) {
      // Tolère un sur-paiement uniquement en espèces (rendu monnaie)
      const hasCash = payments.some((p) => p.method === 'cash');
      if (!(paid > totalTtc && hasCash)) {
        setError('Le total payé doit être égal au total dû.');
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      // On ramène les paiements à la somme exacte. Pour les espèces, on conserve given_amount.
      const adjusted: { method: Method; amount: number; given_amount?: number; reference?: string }[] = [];
      let toAllocate = totalTtc;
      for (const p of payments) {
        if (p.method === 'cash' && p.amount > toAllocate) {
          adjusted.push({
            method: 'cash',
            amount: round2(toAllocate),
            given_amount: round2(p.amount),
            reference: p.reference,
          });
          toAllocate = 0;
        } else {
          const amt = Math.min(round2(p.amount), round2(toAllocate));
          if (amt <= 0) continue;
          adjusted.push({ method: p.method, amount: amt, reference: p.reference });
          toAllocate = round2(toAllocate - amt);
        }
      }
      if (toAllocate > 0.005) {
        setError('Allocation incomplète.');
        return;
      }
      const res = await fetch(`/api/sales/${saleId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: adjusted }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Erreur d\'encaissement');
        return;
      }
      const j = await res.json();
      onValidated(j.receipt_id, j.receipt_number);
    } finally { setLoading(false); }
  }

  return (
    <Modal onClose={onClose} title="Encaissement">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-sm text-ink-soft">Total à encaisser</div>
          <div className="text-3xl font-semibold tracking-tight">{formatEUR(totalTtc)}</div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                className="btn-soft text-sm"
                onClick={() => {
                  // Ajoute un moyen pré-rempli avec le reste à payer
                  if (remaining <= 0) return;
                  setPayments((cur) => [
                    ...cur,
                    { key: `p${cur.length + 1}`, method: m, amount: round2(remaining) },
                  ]);
                }}
              >
                {PAYMENT_LABELS[m]}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[5, 10, 20, 50, 100, 200].map((d) => (
              <button
                key={d}
                className="btn-ghost text-sm"
                onClick={() => {
                  setPayments((cur) => {
                    const idx = cur.findIndex((p) => p.method === 'cash');
                    if (idx === -1) return [...cur, { key: `p${cur.length + 1}`, method: 'cash', amount: d }];
                    return cur.map((p, i) => i === idx ? { ...p, amount: round2((p.amount || 0) + d) } : p);
                  });
                }}
              >
                +{d}€
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {payments.map((p, idx) => (
            <div key={p.key} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <select
                  className="input h-9 flex-1"
                  value={p.method}
                  onChange={(e) => update(idx, { method: e.target.value as Method })}
                >
                  {METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                </select>
                <input
                  type="number" step="0.01" min={0}
                  className="input h-9 w-28 text-right"
                  value={p.amount}
                  onChange={(e) => update(idx, { amount: Number(e.target.value || 0) })}
                  autoFocus={idx === payments.length - 1}
                />
                <button onClick={() => remove(idx)} className="text-ink-soft hover:text-danger">✕</button>
              </div>
              {(p.method === 'gift_card' || p.method === 'credit_note' || p.method === 'check') && (
                <input
                  className="input h-9 mt-2 text-xs"
                  placeholder="Référence"
                  value={p.reference ?? ''}
                  onChange={(e) => update(idx, { reference: e.target.value })}
                />
              )}
            </div>
          ))}

          <button className="btn-ghost text-sm" onClick={add}>+ Ajouter un moyen</button>

          <div className="rounded-xl bg-bg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Payé</span><span className="font-medium">{formatEUR(paid)}</span></div>
            <div className="flex justify-between"><span>Reste</span>
              <span className={`font-medium ${Math.abs(remaining) < 0.01 ? 'text-success' : 'text-warning'}`}>
                {formatEUR(remaining)}
              </span>
            </div>
            {change > 0 && (
              <div className="flex justify-between text-sage-deep">
                <span>Rendu monnaie</span><span className="font-semibold">{formatEUR(change)}</span>
              </div>
            )}
          </div>

          {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

          <button disabled={loading} onClick={() => void validate()} className="btn-primary w-full h-12 text-base">
            {loading ? 'Validation…' : `Valider · ${formatEUR(totalTtc)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-3xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
