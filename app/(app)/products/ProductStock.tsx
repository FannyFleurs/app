'use client';

import { useEffect, useState } from 'react';

interface Level {
  store_id: string;
  store_name: string;
  quantity: string;
  unit: string | null;
  min_stock: string | null;
  max_stock: string | null;
}

/**
 * Onglet « Stock » de la fiche produit : quantité en stock par boutique.
 * Si `storeId` est fourni (contexte caisse d'un poste), on ne montre que la
 * boutique concernée.
 */
export default function ProductStock({ productId, storeId }: {
  productId: string;
  storeId?: string;
}) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams({ product_id: productId });
    if (storeId) qs.set('store_id', storeId);
    fetch(`/api/stock/levels?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { levels: [] }))
      .then((j) => setLevels(j.levels ?? []))
      .catch(() => setLevels([]))
      .finally(() => setLoading(false));
  }, [productId, storeId]);

  if (loading) return <p className="text-sm text-ink-soft py-4">Chargement du stock…</p>;

  if (levels.length === 0) {
    return (
      <p className="text-sm text-ink-soft py-4">
        Aucun stock enregistré pour ce produit{storeId ? ' dans cette boutique' : ''}.
      </p>
    );
  }

  const fmt = (v: string | null) => {
    const n = Number(v);
    return Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')) : '—';
  };

  return (
    <div className="space-y-2 py-1">
      <div className="text-xs uppercase tracking-wide text-ink-soft font-semibold">Quantité en stock</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft text-xs uppercase tracking-wide">
              <th className="py-1.5">Boutique</th>
              <th className="text-right">En stock</th>
              <th className="text-right">Mini</th>
              <th className="text-right">Maxi</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => {
              const qty = Number(l.quantity);
              const min = l.min_stock != null ? Number(l.min_stock) : null;
              const low = min != null && min > 0 && qty <= min;
              return (
                <tr key={l.store_id} className="border-t border-border">
                  <td className="py-2">{l.store_name}</td>
                  <td className={`text-right font-semibold ${low ? 'text-danger' : qty <= 0 ? 'text-warning' : ''}`}>
                    {fmt(l.quantity)}{l.unit ? ` ${l.unit}` : ''}
                  </td>
                  <td className="text-right text-ink-soft">{fmt(l.min_stock)}</td>
                  <td className="text-right text-ink-soft">{fmt(l.max_stock)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">
        Rouge = sous le seuil mini. Modifie le stock via Stock → Mouvement ou Inventaire.
      </p>
    </div>
  );
}
