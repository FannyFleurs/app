'use client';

import { useEffect, useState } from 'react';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import ReceptionFormModal from './ReceptionFormModal';

interface Reception {
  id: string;
  filename: string | null;
  store_ids: string[];
  sent_to_pda: boolean;
  created_at: string;
  total: number;
  received: number;
  started: boolean;
}

export default function ReceptionsList({ stores, canWrite }: {
  stores: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [items, setItems] = useState<Reception[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ id: string | null } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/receptions', { cache: 'no-store' });
      if (r.ok) setItems((await r.json()).receptions);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function storeNames(ids: string[]) {
    if (ids.length === 0) return 'Toutes les boutiques';
    return ids.map((id) => stores.find((s) => s.id === id)?.name ?? '?').join(', ');
  }

  function statusOf(r: Reception): { label: string; tone: 'success' | 'warning' | 'neutral' } {
    if (r.received === 0) return { label: 'En attente', tone: 'neutral' };
    if (r.received < r.total) return { label: 'En cours', tone: 'warning' };
    return { label: 'Terminée', tone: 'success' };
  }

  return (
    <div className="p-6 md:p-8 space-y-5 w-full">
      <PageHeader
        title="Réceptions"
        subtitle="Articles envoyés au PDA pour réception physique et impression d'étiquettes."
        actions={canWrite ? (
          <button className="btn-primary h-11 px-5 text-sm font-semibold whitespace-nowrap"
                  onClick={() => setModal({ id: null })}>
            + Créer une réception
          </button>
        ) : undefined}
      />

      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : items.length === 0 ? (
        <EmptyState icon="◎" title="Aucune réception"
                    description="Les imports envoyés au PDA et les réceptions créées manuellement apparaîtront ici." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[42rem]">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Réception</th>
                <th className="text-left px-4 py-3">Boutique(s)</th>
                <th className="text-right px-4 py-3">Articles</th>
                <th className="text-right px-4 py-3">Reçus</th>
                <th className="text-left px-4 py-3">Créé le</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const s = statusOf(r);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{r.filename ?? 'Réception manuelle'}</td>
                    <td className="px-4 py-3 text-ink-soft">{storeNames(r.store_ids)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.received}</td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(r.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-accent-deep hover:underline text-sm"
                              onClick={() => setModal({ id: r.id })}>
                        {r.started || !canWrite ? 'Voir' : 'Modifier'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ReceptionFormModal
          receptionId={modal.id}
          stores={stores}
          canWrite={canWrite}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void load(); }}
        />
      )}
    </div>
  );
}
