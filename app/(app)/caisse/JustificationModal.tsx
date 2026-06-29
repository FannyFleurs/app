'use client';

import { useState } from 'react';

interface Props {
  title: string;
  description: string;
  defaultReason?: string;
  presets?: string[];
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const DEFAULT_PRESETS = [
  'Geste commercial',
  'Erreur de saisie',
  'Produit abîmé',
  'Promotion en cours',
  'Demande client',
];

export default function JustificationModal({
  title, description, defaultReason = '', presets = DEFAULT_PRESETS, onClose, onConfirm,
}: Props) {
  const [reason, setReason] = useState(defaultReason);

  function confirm() {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>
        <p className="text-sm text-ink-soft mt-1">{description}</p>

        <div className="mt-3 flex gap-1.5 flex-wrap">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setReason(p)}
              className={`rounded-full px-4 h-10 text-sm font-medium border ${
                reason === p ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <label className="text-sm font-medium text-ink-soft mt-3 block">Motif (obligatoire)</label>
        <textarea
          autoFocus
          className="input mt-1 h-24 text-base py-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) confirm(); }}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost h-12 text-base px-5">Annuler</button>
          <button onClick={confirm} disabled={!reason.trim()} className="btn-primary h-12 text-base font-semibold px-6">
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
