'use client';

import { useState } from 'react';

export interface ReasonPreset {
  label: string;
  /** Si true, choisir ce motif exige que le vendeur tape une explication en
   *  plus (le champ ne se pré-remplit pas) ; sinon un clic suffit. */
  justification_required: boolean;
}

interface Props {
  title: string;
  description: string;
  defaultReason?: string;
  presets?: ReasonPreset[];
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const DEFAULT_PRESETS: ReasonPreset[] = [
  { label: 'Geste commercial', justification_required: true },
  { label: 'Erreur de saisie', justification_required: true },
  { label: 'Produit abîmé', justification_required: true },
  { label: 'Promotion en cours', justification_required: true },
  { label: 'Demande client', justification_required: true },
];

export default function JustificationModal({
  title, description, defaultReason = '', presets = DEFAULT_PRESETS, onClose, onConfirm,
}: Props) {
  const [reason, setReason] = useState(defaultReason);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  // Motif libre (aucun des motifs ci-dessous n'a été cliqué) : obligatoire par défaut.
  const [required, setRequired] = useState(true);

  function pickPreset(p: ReasonPreset) {
    setSelectedLabel(p.label);
    setRequired(p.justification_required);
    // Motif qui n'exige rien de plus : un clic suffit, le libellé fait office de motif.
    // Motif qui exige une justification : le champ se vide, le vendeur doit l'écrire lui-même.
    setReason(p.justification_required ? '' : p.label);
  }

  function confirm() {
    if (required && !reason.trim()) return;
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
              key={p.label}
              onClick={() => pickPreset(p)}
              className={`rounded-full px-4 h-10 text-sm font-medium border ${
                selectedLabel === p.label ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="text-sm font-medium text-ink-soft mt-3 block">
          Motif {required ? '(obligatoire)' : '(facultatif)'}
        </label>
        <textarea
          autoFocus
          className="input mt-1 h-24 text-base py-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) confirm(); }}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost h-12 text-base px-5">Annuler</button>
          <button onClick={confirm} disabled={required && !reason.trim()} className="btn-primary h-12 text-base font-semibold px-6">
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
