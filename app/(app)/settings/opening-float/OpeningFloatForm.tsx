'use client';

import { useState } from 'react';
import {
  OPENING_FLOAT_MODES,
  OPENING_FLOAT_LABELS,
  type PosUiSettings,
  type OpeningFloatMode,
} from '@/lib/settings/pos-ui';
import { formatEUR } from '@/lib/services/money';

export default function OpeningFloatForm({ initial, canEdit }: {
  initial: PosUiSettings; canEdit: boolean;
}) {
  const [mode, setMode] = useState<OpeningFloatMode>(initial.opening_float_mode);
  const [amount, setAmount] = useState<number>(initial.opening_float_amount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/pos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opening_float_mode: mode,
        opening_float_amount: amount,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-8 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fond de caisse</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Comment pré-remplir le fond de caisse à l&apos;ouverture chaque matin.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        {OPENING_FLOAT_MODES.map((m) => {
          const meta = OPENING_FLOAT_LABELS[m];
          const active = mode === m;
          return (
            <label
              key={m}
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                active ? 'border-ink bg-accent-soft' : 'border-border bg-white hover:border-gray-300'
              } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="opening_float_mode"
                value={m}
                checked={active}
                onChange={() => canEdit && setMode(m)}
                disabled={!canEdit}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">{meta.label}</div>
                <div className="text-xs text-ink-soft mt-0.5">{meta.description}</div>
              </div>
            </label>
          );
        })}

        {mode === 'fixed' && (
          <div className="rounded-xl border border-border bg-white p-3 ml-7 mt-2">
            <label className="text-xs font-medium text-ink-soft">Montant du fond fixe (€)</label>
            <input
              type="number" step="0.01" min={0}
              className="input mt-1 max-w-xs"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value || 0))}
              disabled={!canEdit}
            />
            <p className="mt-1 text-xs text-ink-soft">
              Aperçu : {formatEUR(amount)}
            </p>
          </div>
        )}
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

      {canEdit && (
        <button onClick={() => void submit()} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}
