'use client';

import { useState, useMemo } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';

interface Props {
  unitPriceTtc: number;
  quantity: number;
  currentDiscount: number;
  label: string;
  onClose: () => void;
  onSave: (discountAmount: number) => void;
}

export default function LineDiscountModal({
  unitPriceTtc, quantity, currentDiscount, label, onClose, onSave,
}: Props) {
  const baseTtc = round2(unitPriceTtc * quantity);
  const [mode, setMode] = useState<'percent' | 'amount'>(
    currentDiscount > 0 ? 'amount' : 'percent',
  );
  const initialPct = currentDiscount > 0 ? Number(((currentDiscount / baseTtc) * 100).toFixed(2)) : 0;
  const [percent, setPercent] = useState<number>(initialPct);
  const [amount, setAmount] = useState<number>(currentDiscount);

  const computedAmount = useMemo(() => {
    if (mode === 'percent') return round2((baseTtc * percent) / 100);
    return round2(Math.min(amount, baseTtc));
  }, [mode, percent, amount, baseTtc]);

  const finalLineTtc = Math.max(0, round2(baseTtc - computedAmount));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Remise sur l&apos;article</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <p className="mt-1 text-sm text-ink-soft truncate">{label}</p>
        <p className="text-xs text-ink-soft">Base : {quantity} × {formatEUR(unitPriceTtc)} = {formatEUR(baseTtc)}</p>

        <div className="mt-4 flex gap-1">
          <button
            type="button"
            onClick={() => setMode('percent')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors ${
              mode === 'percent' ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border'
            }`}
          >Pourcentage</button>
          <button
            type="button"
            onClick={() => setMode('amount')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors ${
              mode === 'amount' ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border'
            }`}
          >Montant €</button>
        </div>

        {mode === 'percent' ? (
          <div className="mt-4">
            <label className="text-xs font-medium text-ink-soft">Pourcentage de remise</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number" step="0.1" min={0} max={100}
                className="input text-2xl font-semibold"
                value={percent || ''}
                onChange={(e) => setPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                placeholder="0"
                autoFocus
              />
              <span className="text-2xl font-semibold text-ink-soft">%</span>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {[5, 10, 15, 20, 30].map((p) => (
                <button key={p} type="button" onClick={() => setPercent(p)}
                        className="btn-ghost text-xs">-{p}%</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <label className="text-xs font-medium text-ink-soft">Montant de remise (€)</label>
            <input
              type="number" step="0.01" min={0} max={baseTtc}
              className="input mt-1 text-2xl font-semibold"
              value={amount || ''}
              onChange={(e) => setAmount(Math.max(0, Math.min(baseTtc, Number(e.target.value) || 0)))}
              placeholder="0,00"
              autoFocus
            />
          </div>
        )}

        <div className="mt-4 rounded-xl bg-gray-50 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-soft">Remise appliquée</span>
            <span className="font-medium text-warning">-{formatEUR(computedAmount)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-1 border-t border-border">
            <span className="font-semibold">Nouveau total ligne</span>
            <span className="text-xl font-semibold">{formatEUR(finalLineTtc)}</span>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {currentDiscount > 0 && (
            <button onClick={() => onSave(0)} className="btn-ghost text-sm">
              Supprimer la remise
            </button>
          )}
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => onSave(computedAmount)} className="btn-primary">
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
