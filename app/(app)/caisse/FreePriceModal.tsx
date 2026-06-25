'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

interface Props {
  defaultTaxCode: string;
  defaultLabel?: string;
  taxRates: { code: string; rate: number; is_default: boolean }[];
  onClose: () => void;
  onConfirm: (amount: number, taxCode: string, label: string) => void;
}

export default function FreePriceModal({
  defaultTaxCode, defaultLabel, taxRates, onClose, onConfirm,
}: Props) {
  const [amount, setAmount] = useState(0);
  const [amountStr, setAmountStr] = useState('');
  const [label, setLabel] = useState(defaultLabel || 'Bouquet personnalisé');
  // Taux TVA caché : on prend la valeur fournie ou la valeur par défaut
  const taxCode = defaultTaxCode;

  function press(key: string) {
    setAmountStr((cur) => {
      let next = cur;
      if (key === 'C') next = '';
      else if (key === '⌫') next = cur.slice(0, -1);
      else if (key === '.') {
        if (cur.includes('.') || cur.length === 0) next = cur || '0.';
        else next = cur + '.';
      } else {
        next = cur === '0' ? key : cur + key;
      }
      setAmount(Number(next) || 0);
      return next;
    });
  }

  function confirm() {
    if (!amount || amount <= 0 || !label.trim()) return;
    onConfirm(amount, taxCode, label.trim());
  }

  // Clavier physique
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Si l'utilisateur tape dans l'input libellé, laisser passer
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' && target.getAttribute('data-numpad') !== 'true') {
        if (e.key === 'Enter' && (e.target as HTMLInputElement).type !== 'textarea') confirm();
        return;
      }
      if (e.key >= '0' && e.key <= '9') { press(e.key); e.preventDefault(); }
      else if (e.key === '.' || e.key === ',') { press('.'); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('⌫'); e.preventDefault(); }
      else if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'Enter') { confirm(); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, label]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Saisie prix libre</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="mt-3">
          <label className="text-sm font-medium text-ink-soft">Libellé</label>
          <input
            className="input mt-1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-border p-3 bg-gray-50">
          <div className="text-xs uppercase tracking-wider text-ink-soft">Montant TTC</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-4xl font-semibold tabular-nums">
              {amountStr === '' ? '—' : formatEUR(amount)}
            </span>
            <button onClick={() => { setAmountStr(''); setAmount(0); }}
                    className="text-xs text-ink-soft hover:text-ink">Effacer</button>
          </div>
          <div className="mt-1 text-xs text-ink-soft">
            Tapez au clavier physique ou utilisez le pavé. Entrée = ajouter au panier.
          </div>
        </div>

        {/* Pavé numérique */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-14 rounded-xl border border-border bg-white text-2xl font-medium hover:bg-gray-50 active:scale-95 transition"
            >
              {k}
            </button>
          ))}
        </div>

        <button
          disabled={amount <= 0 || !label.trim()}
          onClick={confirm}
          className="btn-primary w-full mt-4 h-14 text-lg"
        >
          Ajouter au panier · {formatEUR(amount || 0)}
        </button>
      </div>
    </div>
  );
}
