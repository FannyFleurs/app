'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

export default function OpenSessionModal({
  storeId, registerId, onClose, onOpened,
}: { storeId: string; registerId: string; onClose: () => void; onOpened: () => void }) {
  const [openingFloat, setOpeningFloat] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{
    mode: 'manual' | 'fixed' | 'previous_close';
    amount: number | null;
    fallback?: number;
  } | null>(null);

  // Charge la suggestion serveur dès l'ouverture
  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/cash-sessions/suggest-float?register_id=${registerId}`);
      if (!r.ok) return;
      const j = await r.json();
      setSuggestion(j);
      if (j.mode === 'fixed') setOpeningFloat(Number(j.amount ?? 0));
      else if (j.mode === 'previous_close' && j.amount != null) setOpeningFloat(Number(j.amount));
    })();
  }, [registerId]);

  async function submit() {
    setLoading(true); setError(null);
    const res = await fetch('/api/cash-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, register_id: registerId, opening_float: openingFloat }),
    });
    setLoading(false);
    if (!res.ok) { setError((await res.json()).error ?? 'Erreur'); return; }
    onOpened();
  }

  const suggestionLabel = (() => {
    if (!suggestion) return null;
    if (suggestion.mode === 'fixed') return `Fond fixe configuré : ${formatEUR(Number(suggestion.amount ?? 0))}`;
    if (suggestion.mode === 'previous_close') {
      if (suggestion.amount != null) return `Solde compté lors de la dernière clôture : ${formatEUR(suggestion.amount)}`;
      return 'Aucune clôture précédente — saisissez manuellement.';
    }
    return null;
  })();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ouverture caisse</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <p className="mt-2 text-sm text-ink-soft">
          Bonjour ! Confirmez le fond de caisse présent dans le tiroir avant de démarrer la journée.
        </p>

        {suggestionLabel && (
          <div className="mt-3 rounded-xl border border-border bg-gray-50 px-3 py-2 text-xs text-ink-soft">
            {suggestionLabel}
          </div>
        )}

        <label className="block mt-4 text-sm font-medium text-ink-soft">Fond de caisse (€)</label>
        <input
          type="number" step="0.01" min={0}
          className="input mt-1 text-2xl font-semibold"
          value={openingFloat}
          onChange={(e) => setOpeningFloat(Number(e.target.value))}
          autoFocus
        />

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <button disabled={loading} onClick={() => void submit()} className="btn-primary w-full mt-4 h-11">
          {loading ? 'Ouverture…' : `Ouvrir la caisse avec ${formatEUR(openingFloat)}`}
        </button>

        <p className="mt-3 text-xs text-ink-soft">
          Vous pouvez changer le mode d&apos;ouverture (manuel / montant fixe / solde de la veille) dans
          les Paramètres caisse.
        </p>
      </div>
    </div>
  );
}
