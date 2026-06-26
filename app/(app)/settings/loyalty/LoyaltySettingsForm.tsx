'use client';

import { useState } from 'react';
import type { PosUiSettings, LoyaltySettings } from '@/lib/settings/pos-ui';

export default function LoyaltySettingsForm({ initial, canEdit }: {
  initial: PosUiSettings; canEdit: boolean;
}) {
  const [loyalty, setLoyalty] = useState<LoyaltySettings>(initial.loyalty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch<K extends keyof LoyaltySettings>(k: K, v: LoyaltySettings[K]) {
    if (!canEdit) return;
    setLoyalty((s) => ({ ...s, [k]: v }));
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/pos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loyalty }),
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
        <h1 className="text-2xl font-semibold tracking-tight">Fidélité</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Les remises de fidélité se déclenchent depuis la fiche client en caisse une
          fois le seuil atteint.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <label className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
          <span className="text-sm font-medium">Programme activé</span>
          <input
            type="checkbox" className="h-5 w-5"
            checked={loyalty.enabled}
            disabled={!canEdit}
            onChange={(e) => patch('enabled', e.target.checked)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">€ de fidélité gagnés</label>
            <input
              type="number" step="0.5" min={0}
              className="input mt-1"
              value={loyalty.euros_earned}
              disabled={!canEdit || !loyalty.enabled}
              onChange={(e) => patch('euros_earned', Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">… tous les € dépensés</label>
            <input
              type="number" step="1" min={1}
              className="input mt-1"
              value={loyalty.per_euros_spent}
              disabled={!canEdit || !loyalty.enabled}
              onChange={(e) => patch('per_euros_spent', Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Seuil d&apos;utilisation minimum (€)</label>
            <input
              type="number" step="0.5" min={0}
              className="input mt-1"
              value={loyalty.min_redeem}
              disabled={!canEdit || !loyalty.enabled}
              onChange={(e) => patch('min_redeem', Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={loyalty.stackable}
                disabled={!canEdit || !loyalty.enabled}
                onChange={(e) => patch('stackable', e.target.checked)}
              />
              Cumulable avec d&apos;autres remises
            </label>
          </div>
        </div>
        {loyalty.enabled && (
          <p className="text-xs text-ink-soft">
            Règle actuelle : {loyalty.euros_earned} € gagnés tous les{' '}
            {loyalty.per_euros_spent} € dépensés. Utilisable à partir de{' '}
            {loyalty.min_redeem} € cumulés.
            {loyalty.stackable ? ' Cumulable avec d\'autres remises.' : ' Non cumulable.'}
          </p>
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
