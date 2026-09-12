'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { confirmThemed } from '@/lib/ui/dialog';

interface DeliveryInfo {
  source?: string;
  pickup_or_delivery?: 'pickup' | 'delivery';
  recipient_name?: string | null;
  slot_label?: string | null;
}
interface Held {
  id: string; held_label: string; total_ttc: string; created_at: string;
  delivery_info?: DeliveryInfo | null;
}

export default function HoldListModal({
  storeId, onClose, onPick, onCleared,
}: { storeId: string; onClose: () => void; onPick: (id: string) => void; onCleared?: () => void }) {
  const [items, setItems] = useState<Held[]>([]);
  const [clearing, setClearing] = useState(false);

  async function reload() {
    // Tickets en attente de la BOUTIQUE (toutes ses caisses).
    const res = await fetch(`/api/sales/held?store_id=${encodeURIComponent(storeId)}`);
    if (res.ok) {
      const j = await res.json();
      setItems(j.held);
    }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [storeId]);

  // Paniers « vidables » : tout sauf les commandes entrantes (préservées).
  const clearable = items.filter((it) => it.delivery_info?.source !== 'commande').length;

  async function clearAll() {
    if (clearable === 0) return;
    const ok = await confirmThemed({
      title: 'Vider les paniers en attente',
      message: `Supprimer ${clearable} panier${clearable > 1 ? 's' : ''} en attente ?\n\n`
        + 'Les commandes entrantes (Commande / Retrait) sont conservées. '
        + 'Cette action est définitive — ces paniers n\'ont jamais été encaissés.',
      confirmLabel: 'Vider',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      const res = await fetch('/api/sales/held/clear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId }),
      });
      if (res.ok) {
        await reload();
        onCleared?.();
      }
    } finally {
      setClearing(false);
    }
  }

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
          ) : items.map((it) => {
            const di = it.delivery_info;
            const isOrder = di?.source === 'commande';
            return (
            <button
              key={it.id}
              onClick={() => onPick(it.id)}
              className="w-full text-left rounded-xl border border-border px-4 py-4 hover:border-sage hover:bg-accent-soft active:scale-[0.99] transition"
            >
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-base flex items-center gap-2 min-w-0">
                  {isOrder && (
                    <span className="shrink-0 rounded-full bg-[color:var(--primary-soft)] text-[color:var(--primary-deep)] text-[11px] font-semibold px-2 py-0.5 uppercase tracking-wide">
                      {di?.pickup_or_delivery === 'pickup' ? 'Retrait' : 'Commande'}
                    </span>
                  )}
                  <span className="truncate">{it.held_label || 'Sans libellé'}</span>
                </span>
                <span className="font-semibold text-lg shrink-0">{formatEUR(Number(it.total_ttc))}</span>
              </div>
              {isOrder && (di?.recipient_name || di?.slot_label) && (
                <div className="text-xs text-ink-soft mt-1">
                  {[di?.recipient_name, di?.slot_label].filter(Boolean).join(' · ')}
                </div>
              )}
              <div className="text-xs text-ink-soft mt-0.5">
                {new Date(it.created_at).toLocaleString('fr-FR')}
              </div>
            </button>
            );
          })}
        </div>

        {clearable > 0 && (
          <div className="mt-4 pt-3 border-t border-border flex justify-end">
            <button
              onClick={() => void clearAll()}
              disabled={clearing}
              className="btn-ghost text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
              title="Supprimer tous les paniers en attente (hors commandes entrantes)"
            >
              {clearing ? 'Suppression…' : `🗑 Vider les paniers en attente (${clearable})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
