'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';

interface Inventory {
  id: string;
  label: string;
  store_id: string;
  store_name: string;
  scope_type: 'total' | 'category' | 'supplier';
  scope_ids: string[];
  status: 'in_progress' | 'in_review' | 'finalized' | 'cancelled';
  created_at: string;
  finalized_at: string | null;
  line_count: number;
  delta_count: number;
}

const SCOPE_LABEL: Record<string, string> = {
  total: 'Total',
  category: 'Catégories',
  supplier: 'Fournisseurs',
};

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  in_progress: { label: 'En cours',   tone: 'warning' },
  in_review:   { label: 'À pointer',  tone: 'warning' },
  finalized:   { label: 'Validé',     tone: 'success' },
  cancelled:   { label: 'Annulé',     tone: 'neutral' },
};

export default function InventoryList({ stores, lockedStoreId }: {
  stores: { id: string; name: string }[];
  lockedStoreId?: string | null;
}) {
  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  // Un inventaire appartient à une boutique : la liste en montre une à la
  // fois, celle du poste par défaut.
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    if (lockedStoreId) { setStoreId(lockedStoreId); return; }
    let sid = '';
    try { sid = localStorage.getItem('webpos_current_store_id') || ''; } catch { /* ignore */ }
    if (!sid || !stores.some((s) => s.id === sid)) sid = stores[0]?.id ?? '';
    setStoreId(sid);
  }, [stores, lockedStoreId]);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    void (async () => {
      const r = await fetch(`/api/inventories?store_id=${encodeURIComponent(storeId)}`);
      if (r.ok) setItems((await r.json()).inventories);
      setLoading(false);
    })();
  }, [storeId]);

  return (
    <div className="p-6 md:p-8 space-y-5 w-full">
      <PageHeader
        title="Inventaires"
        subtitle="Sessions de comptage — total, par catégorie ou par fournisseur."
        actions={
          <div className="flex items-center gap-2">
            {!lockedStoreId && stores.length > 1 && (
              <select className="input h-11 min-w-[170px] text-sm" value={storeId}
                      onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <Link href="/inventory/new" className="btn-primary h-11 px-5 text-sm font-semibold whitespace-nowrap">
              + Nouvel inventaire
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : items.length === 0 ? (
        <EmptyState icon="◎" title="Aucun inventaire"
                    description={`Aucune session de comptage pour ${stores.find((s) => s.id === storeId)?.name ?? 'cette boutique'}.`} />
      ) : (
        // Défilement plutôt que coupe : en `overflow-hidden`, les dernières
        // colonnes disparaissaient sans recours sur téléphone.
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[38rem]">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Libellé</th>
                <th className="text-left px-4 py-3">Portée</th>
                <th className="text-right px-4 py-3">Lignes</th>
                <th className="text-right px-4 py-3">Écarts</th>
                <th className="text-left px-4 py-3">Créé le</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const s = STATUS_LABEL[i.status] ?? { label: i.status, tone: 'neutral' as const };
                return (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{i.label}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {SCOPE_LABEL[i.scope_type]}
                      {i.scope_type !== 'total' && i.scope_ids.length > 0 && (
                        <span className="text-xs"> · {i.scope_ids.length}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{i.line_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {i.delta_count > 0 ? (
                        <span className="text-warning font-medium">{i.delta_count}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(i.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/inventory/${i.id}`} className="text-accent-deep hover:underline text-sm">
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
