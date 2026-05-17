'use client';

import { useState } from 'react';

export default function OpenSessionModal({
  storeId, registerId, onClose, onOpened,
}: { storeId: string; registerId: string; onClose: () => void; onOpened: () => void }) {
  const [openingFloat, setOpeningFloat] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ouverture caisse</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <label className="block mt-4 text-sm font-medium text-ink-soft">Fond de caisse (€)</label>
        <input
          type="number" step="0.01" min={0}
          className="input mt-1"
          value={openingFloat}
          onChange={(e) => setOpeningFloat(Number(e.target.value))}
        />
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <button disabled={loading} onClick={() => void submit()} className="btn-primary w-full mt-4">
          {loading ? 'Ouverture…' : 'Ouvrir la caisse'}
        </button>
      </div>
    </div>
  );
}
