'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { PAYMENT_LABELS } from '@/components/labels';

interface PaymentSummary {
  method: string;
  amount: number;
}

interface Props {
  saleId: string;
  paymentsByMethod: PaymentSummary[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentCorrectionModal({ saleId, paymentsByMethod, onClose, onSuccess }: Props) {
  const positive = paymentsByMethod.filter((p) => p.amount > 0);
  const [fromMethod, setFromMethod] = useState(positive[0]?.method ?? '');
  const [toMethod, setToMethod] = useState('card');
  const [amount, setAmount] = useState<number>(positive[0]?.amount ?? 0);
  const [reason, setReason] = useState('');
  const [methods, setMethods] = useState<Array<{ kind: string; label: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/payment-methods');
      if (r.ok) {
        const j = await r.json();
        setMethods((j.methods as Array<{ kind: string; label: string; is_active: boolean }>)
          .filter((m) => m.is_active)
          .map((m) => ({ kind: m.kind, label: m.label })));
      }
    })();
  }, []);

  // À chaque changement de from_method, propose le montant disponible
  useEffect(() => {
    const p = positive.find((x) => x.method === fromMethod);
    if (p) setAmount(p.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMethod]);

  const fromMax = positive.find((p) => p.method === fromMethod)?.amount ?? 0;

  async function submit() {
    if (!fromMethod || !toMethod) { setError('Méthodes requises'); return; }
    if (fromMethod === toMethod) { setError('Choisissez deux méthodes différentes'); return; }
    if (amount <= 0 || amount > fromMax + 0.005) { setError('Montant invalide'); return; }
    setSubmitting(true); setError(null);
    const r = await fetch(`/api/sales/${saleId}/correct-payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_method: fromMethod, to_method: toMethod, amount, reason: reason.trim() || undefined }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Changer le règlement</h2>
            <p className="text-sm text-ink-soft">Correction sans modification du ticket : contre-passation traçée.</p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Méthode à corriger</label>
            <select className="input mt-1" value={fromMethod} onChange={(e) => setFromMethod(e.target.value)}>
              {positive.map((p) => (
                <option key={p.method} value={p.method}>
                  {PAYMENT_LABELS[p.method] ?? p.method} ({formatEUR(p.amount)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Nouvelle méthode</label>
            <select className="input mt-1" value={toMethod} onChange={(e) => setToMethod(e.target.value)}>
              {methods.map((m) => <option key={m.kind} value={m.kind}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Montant à transférer</label>
            <input
              type="number" step="0.01" min={0} max={fromMax}
              className="input mt-1 text-xl font-semibold"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-ink-soft">Maximum disponible : {formatEUR(fromMax)}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Motif (facultatif)</label>
            <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)}
                   placeholder="ex : erreur de saisie" />
          </div>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={submitting || !fromMethod || !toMethod || amount <= 0} className="btn-primary">
            {submitting ? 'Application…' : 'Appliquer la correction'}
          </button>
        </div>
      </div>
    </div>
  );
}
