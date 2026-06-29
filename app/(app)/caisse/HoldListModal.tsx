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
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>
        <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun panier en attente sur cette caisse.</p>
          ) : items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it.id)}
              className="w-full text-left rounded-xl border border-border px-4 py-4 hover:border-sage hover:bg-accent-soft active:scale-[0.99] transition"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-base">{it.held_label || 'Sans libellé'}</span>
                <span className="font-semibold text-lg">{formatEUR(Number(it.total_ttc))}</span>
              </div>
              <div className="text-xs text-ink-soft mt-0.5">
                {new Date(it.created_at).toLocaleString('fr-FR')}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
