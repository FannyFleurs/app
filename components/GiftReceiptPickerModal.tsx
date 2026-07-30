'use client';

import { useState } from 'react';

/**
 * Sélecteur d'articles pour le « ticket sans prix ».
 * Ouvre le PDF ticket sans prix (gift=1) avec le sous-ensemble d'articles
 * choisi (positions 0-based, dans l'ordre du snapshot du ticket).
 *
 * `pdfBaseUrl` : URL du PDF du ticket, sans query — ex.
 *   /api/receipts/<id>/pdf  ou  /api/receipts/by-sale/<saleId>/pdf
 */
export default function GiftReceiptPickerModal({
  lines, pdfBaseUrl, onClose,
}: {
  lines: Array<{ label: string; quantity: string | number }>;
  pdfBaseUrl: string;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set(lines.map((_, i) => i)));

  function print() {
    const idx = [...sel].sort((a, b) => a - b);
    if (idx.length === 0) return;
    const all = idx.length === lines.length;
    window.open(`${pdfBaseUrl}?gift=1${all ? '' : `&lines=${idx.join(',')}`}`, '_blank');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Ticket sans prix</h3>
        <p className="text-xs text-ink-soft mt-1">
          Choisissez les articles à faire figurer sur le ticket sans prix.
        </p>
        <div className="mt-3 flex items-center justify-between text-xs">
          <button className="text-accent-deep font-medium" onClick={() => setSel(new Set(lines.map((_, i) => i)))}>
            Tout sélectionner
          </button>
          <button className="text-ink-soft" onClick={() => setSel(new Set())}>
            Tout décocher
          </button>
        </div>
        <ul className="mt-2 max-h-[50vh] overflow-auto divide-y divide-border rounded-xl border border-border">
          {lines.map((l, i) => (
            <li key={i}>
              <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={sel.has(i)}
                  onChange={() => setSel((cur) => {
                    const next = new Set(cur);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })}
                />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{l.label}</span>
                  <span className="ml-1.5 text-xs text-ink-soft">× {l.quantity}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost min-h-[44px] px-4">Annuler</button>
          <button onClick={print} disabled={sel.size === 0} className="btn-primary min-h-[44px] px-4 disabled:opacity-40">
            Imprimer ({sel.size})
          </button>
        </div>
      </div>
    </div>
  );
}
