'use client';

import { useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';

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
  onClose: () => void;
  onSuccess: (creditNote: { id: string; number: string; amount: number }) => void;
}

export default function ReturnModal({ saleId, receiptNumber, lines, onClose, onSuccess }: Props) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'credit_note' | 'cash'>('credit_note');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function submit() {
    if (selectedCount === 0) { setError('Sélectionnez au moins une ligne.'); return; }
    if (!reason.trim()) { setError('Motif obligatoire.'); return; }
    setSubmitting(true); setError(null);
    const body = {
      lines: Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([line_index, q]) => ({ line_index: Number(line_index), quantity: Number(q) })),
      reason: reason.trim(),
      refund_method: refundMethod,
    };
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
    onSuccess({ id: j.credit_note_id, number: j.number, amount: j.amount });
  }

  function setQty(line_index: number, qty: number, max: number) {
    const v = Math.max(0, Math.min(max, qty));
    setQuantities((cur) => ({ ...cur, [line_index]: v }));
  }
  function setAll(line: SaleLine) {
    setQty(line.line_index, Number(line.quantity), Number(line.quantity));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card max-w-2xl w-full p-6 my-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Retour produit</h2>
            <p className="text-sm text-ink-soft">Ticket {receiptNumber}</p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="space-y-2 max-h-[40vh] overflow-auto">
          {lines.map((l) => {
            const max = Number(l.quantity);
            const qty = quantities[l.line_index] ?? 0;
            return (
              <div key={l.line_index} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{l.label}</div>
                    <div className="text-xs text-ink-soft">
                      {max} × {formatEUR(Number(l.unit_price_ttc))} · TVA {l.tax_rate}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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

        <div className="mt-3">
          <div className="text-sm font-medium text-ink-soft mb-1">Mode de remboursement</div>
          <div className="grid grid-cols-2 gap-2">
            <label className={`rounded-xl border p-3 cursor-pointer ${refundMethod === 'credit_note' ? 'border-ink bg-accent-soft' : 'border-border'}`}>
              <input type="radio" name="refund" value="credit_note" className="mr-2"
                     checked={refundMethod === 'credit_note'} onChange={() => setRefundMethod('credit_note')} />
              <span className="font-medium">Avoir</span>
              <div className="text-xs text-ink-soft mt-0.5 ml-5">Utilisable lors d&apos;un prochain achat.</div>
            </label>
            <label className={`rounded-xl border p-3 cursor-pointer ${refundMethod === 'cash' ? 'border-ink bg-accent-soft' : 'border-border'}`}>
              <input type="radio" name="refund" value="cash" className="mr-2"
                     checked={refundMethod === 'cash'} onChange={() => setRefundMethod('cash')} />
              <span className="font-medium">Espèces</span>
              <div className="text-xs text-ink-soft mt-0.5 ml-5">Sortie immédiate du tiroir-caisse.</div>
            </label>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-gray-50 p-3 flex items-baseline justify-between">
          <span className="text-sm text-ink-soft">{selectedCount} ligne(s) à rembourser</span>
          <span className="text-2xl font-semibold text-danger">-{formatEUR(refundAmount)}</span>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={submitting || refundAmount <= 0 || !reason.trim()} className="btn-primary">
            {submitting ? 'Traitement…' : `Valider le retour · ${formatEUR(refundAmount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
