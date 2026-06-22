'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';

type Method = 'cash' | 'card' | 'check' | 'transfer' | 'gift_card' | 'credit_note' | 'other' | 'deferred';

const FALLBACK_METHODS: Array<{ kind: Method; label: string }> = [
  { kind: 'cash', label: 'Espèces' },
  { kind: 'card', label: 'Carte bancaire' },
  { kind: 'check', label: 'Chèque' },
  { kind: 'transfer', label: 'Virement' },
  { kind: 'gift_card', label: 'Carte cadeau' },
  { kind: 'credit_note', label: 'Avoir' },
];

interface RegisteredPayment {
  key: string;
  method: Method;
  label: string;
  amount: number;            // montant alloué au ticket (toujours <= reste à payer)
  given_amount?: number;     // montant donné par le client (utile pour rendu monnaie espèces)
}

interface Props {
  saleId: string;
  totalTtc: number;
  onClose: () => void;
  onValidated: (receiptId: string, receiptNumber: string) => void;
}

export default function PaymentModal({ saleId, totalTtc, onClose, onValidated }: Props) {
  const [methods, setMethods] = useState<Array<{ kind: Method; label: string }>>(FALLBACK_METHODS);
  const [amountStr, setAmountStr] = useState<string>('');
  const [payments, setPayments] = useState<RegisteredPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/payment-methods');
      if (r.ok) {
        const j = await r.json();
        const active = (j.methods as Array<{ kind: Method; label: string; is_active: boolean }>)
          .filter((m) => m.is_active);
        if (active.length > 0) setMethods(active.map((m) => ({ kind: m.kind, label: m.label })));
      }
    })();
  }, []);

  const paidAllocated = useMemo(
    () => round2(payments.reduce((s, p) => s + p.amount, 0)),
    [payments],
  );
  const remaining = round2(Math.max(0, totalTtc - paidAllocated));
  const totalGiven = useMemo(
    () => round2(payments.reduce((s, p) => s + (p.given_amount ?? p.amount), 0)),
    [payments],
  );
  const change = totalGiven > totalTtc ? round2(totalGiven - totalTtc) : 0;

  // Saisie clavier numérique : ajoute un chiffre / point / supprime
  function press(key: string) {
    setError(null);
    setAmountStr((cur) => {
      if (key === 'C') return '';
      if (key === '⌫') return cur.slice(0, -1);
      if (key === '.') {
        if (cur.includes('.') || cur.length === 0) return cur || '0.';
        return cur + '.';
      }
      // Chiffre
      if (cur === '0') return key;
      return cur + key;
    });
  }

  /**
   * Tap d'une méthode de paiement.
   * - Si rien tapé : on alloue tout le restant à cette méthode (montant exact).
   * - Si un montant tapé : on l'alloue à cette méthode.
   *   - Pour espèces avec montant > restant : on tolère un sur-paiement = rendu monnaie.
   *     Le montant alloué reste = restant, given_amount = saisie.
   *   - Pour les autres méthodes : on alloue min(saisie, restant).
   */
  function tapMethod(m: { kind: Method; label: string }) {
    setError(null);
    const typed = Number(amountStr || '0');
    let allocate: number;
    let given: number | undefined = undefined;

    if (typed === 0) {
      // Pas de saisie → on prend exactement le restant
      if (remaining <= 0) return;
      allocate = remaining;
    } else {
      const t = round2(typed);
      if (m.kind === 'cash' && t > remaining) {
        // sur-paiement espèces = rendu monnaie
        allocate = remaining;
        given = t;
      } else {
        allocate = Math.min(t, remaining);
      }
    }

    if (allocate <= 0) return;
    setPayments((cur) => [...cur, {
      key: cryptoKey(),
      method: m.kind,
      label: m.label,
      amount: allocate,
      given_amount: given,
    }]);
    setAmountStr('');
  }

  function removePayment(key: string) {
    setPayments((cur) => cur.filter((p) => p.key !== key));
  }

  async function validate() {
    if (Math.abs(paidAllocated - totalTtc) > 0.005) {
      setError('Le total payé doit être égal au total dû.');
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/sales/${saleId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            given_amount: p.given_amount,
          })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? j.message ?? 'Erreur d\'encaissement');
        return;
      }
      const j = await res.json();
      onValidated(j.receipt_id, j.receipt_number);
    } finally { setLoading(false); }
  }

  const canValidate = Math.abs(paidAllocated - totalTtc) < 0.005;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card w-full max-w-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Encaissement</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
          {/* Colonne gauche : pavé + méthodes */}
          <div>
            <div className="rounded-2xl border border-border p-4 bg-gray-50">
              <div className="text-xs uppercase tracking-wider text-ink-soft">Montant à saisir</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-4xl font-semibold tabular-nums">
                  {amountStr === '' ? '—' : formatEUR(Number(amountStr) || 0)}
                </span>
                <button onClick={() => setAmountStr('')}
                        className="text-xs text-ink-soft hover:text-ink">Effacer</button>
              </div>
              <div className="mt-1 text-xs text-ink-soft">
                Si vide : la méthode prendra le restant ({formatEUR(remaining)}).
              </div>
            </div>

            {/* Pavé numérique */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className="h-14 rounded-xl border border-border bg-white text-xl font-medium hover:bg-gray-50 active:scale-95 transition"
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Méthodes de règlement */}
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-ink-soft mb-2">
                Toucher une méthode pour valider le montant
              </div>
              <div className="grid grid-cols-2 gap-2">
                {methods.map((m) => (
                  <button
                    key={m.kind + m.label}
                    onClick={() => tapMethod(m)}
                    disabled={remaining <= 0 && Number(amountStr || '0') <= 0}
                    className="btn-soft h-14 text-base"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Colonne droite : récap + valider */}
          <div className="flex flex-col">
            <div className="rounded-2xl border border-border p-4 bg-white space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Total dû</span>
                <span className="font-semibold">{formatEUR(totalTtc)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Payé</span>
                <span>{formatEUR(paidAllocated)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5">
                <span className="font-medium">Reste</span>
                <span className={`font-semibold ${remaining === 0 ? 'text-success' : 'text-warning'}`}>
                  {formatEUR(remaining)}
                </span>
              </div>
              {change > 0 && (
                <div className="mt-2 rounded-xl bg-success/10 px-3 py-2 flex items-baseline justify-between">
                  <span className="text-success font-medium">Rendu monnaie</span>
                  <span className="text-2xl font-semibold text-success">{formatEUR(change)}</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex-1 min-h-[100px]">
              <div className="text-xs uppercase tracking-wider text-ink-soft mb-2">Paiements enregistrés</div>
              {payments.length === 0 ? (
                <div className="text-sm text-ink-soft italic">Aucun paiement pour le moment.</div>
              ) : (
                <ul className="space-y-1.5">
                  {payments.map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                      <span className="font-medium">{p.label}</span>
                      <span className="tabular-nums">
                        {formatEUR(p.amount)}
                        {p.given_amount && p.given_amount > p.amount && (
                          <span className="text-ink-soft text-xs ml-1">
                            (reçu {formatEUR(p.given_amount)})
                          </span>
                        )}
                      </span>
                      <button onClick={() => removePayment(p.key)} className="text-ink-soft hover:text-danger">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            )}

            <button
              disabled={loading || !canValidate}
              onClick={() => void validate()}
              className="btn-primary mt-3 w-full h-14 text-lg"
            >
              {loading ? 'Validation…' : canValidate ? `✓ Valider · ${formatEUR(totalTtc)}` : `Reste ${formatEUR(remaining)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function cryptoKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
