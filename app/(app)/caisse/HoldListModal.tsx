'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

interface Held { id: string; held_label: string; total_ttc: string; created_at: string }

export default function HoldListModal({
  registerId, onClose, onPick,
}: { registerId: string; onClose: () => void; onPick: (id: string) => void }) {
  const [items, setItems] = useState<Held[]>([]);
  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/sales/held?register_id=${registerId}`);
      if (res.ok) {
        const j = await res.json();
        setItems(j.held);
      }
    })();
  }, [registerId]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-lg w-full p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Paniers en attente</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="mt-4 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun panier en attente sur cette caisse.</p>
          ) : items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it.id)}
              className="w-full text-left rounded-xl border border-border px-4 py-3 hover:border-sage"
            >
              <div className="flex justify-between">
                <span className="font-medium">{it.held_label || 'Sans libellé'}</span>
                <span className="font-semibold">{formatEUR(Number(it.total_ttc))}</span>
              </div>
              <div className="text-xs text-ink-soft">
                {new Date(it.created_at).toLocaleString('fr-FR')}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
