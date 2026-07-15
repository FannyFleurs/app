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

export default function InventoryList({ defaultStoreId: _defaultStoreId }: { defaultStoreId: string }) {
  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/inventories');
      if (r.ok) setItems((await r.json()).inventories);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-5">
      <PageHeader
        title="Inventaires"
        subtitle="Sessions de comptage — total, par catégorie ou par fournisseur."
        actions={
          <Link href="/inventory/new" className="btn-primary h-11 px-5 text-sm font-semibold whitespace-nowrap">
            + Nouvel inventaire
          </Link>
        }
      />

      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : items.length === 0 ? (
        <EmptyState icon="◎" title="Aucun inventaire" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Libellé</th>
                <th className="text-left px-4 py-3">Boutique</th>
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
                    <td className="px-4 py-3 text-ink-soft">{i.store_name}</td>
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
