'use client';

import { useState } from 'react';

interface Props {
  defaultTaxCode: string;
  taxRates: { code: string; rate: number; is_default: boolean }[];
  onClose: () => void;
  onConfirm: (amount: number, taxCode: string, label: string) => void;
}

export default function FreePriceModal({ defaultTaxCode, taxRates, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState(0);
  const [label, setLabel] = useState('Bouquet personnalisé');
  const [taxCode, setTaxCode] = useState(defaultTaxCode);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bouquet à prix libre</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="space-y-3 mt-4">
          <div>
            <label className="text-sm font-medium text-ink-soft">Libellé</label>
            <input className="input mt-1" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Montant TTC (€)</label>
            <input
              type="number" step="0.01" min={0}
              className="input mt-1 text-2xl font-semibold"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Taux de TVA</label>
            <select className="input mt-1" value={taxCode} onChange={(e) => setTaxCode(e.target.value)}>
              {taxRates.map((t) => (
                <option key={t.code} value={t.code}>{t.code} — {t.rate}%</option>
              ))}
            </select>
          </div>
        </div>
        <button
          disabled={amount <= 0 || !label.trim()}
          className="btn-primary w-full mt-4"
          onClick={() => onConfirm(amount, taxCode, label.trim())}
        >
          Ajouter au panier
        </button>
      </div>
    </div>
  );
}
