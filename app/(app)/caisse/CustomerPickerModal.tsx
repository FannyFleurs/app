'use client';

import { useEffect, useState } from 'react';
import CustomerFormModal from '@/components/CustomerFormModal';

export interface PickedCustomer {
  id: string;
  display_name: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
}

interface Props {
  onClose: () => void;
  onPick: (c: PickedCustomer) => void;
}

export default function CustomerPickerModal({ onClose, onPick }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PickedCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/customers?${params.toString()}`);
      if (res.ok) {
        const j = await res.json();
        setResults(j.customers);
      }
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
        <div className="card max-w-xl w-full p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Sélectionner un client</h2>
            <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
          </div>

          <div className="flex gap-2">
            <input
              autoFocus
              className="input flex-1"
              placeholder="Nom, email, téléphone, SIRET…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn-soft whitespace-nowrap" onClick={() => setCreating(true)}>
              + Nouveau
            </button>
          </div>

          <div className="mt-3 max-h-[55vh] overflow-auto -mx-1 px-1">
            {loading ? (
              <div className="py-8 text-center text-ink-soft text-sm">Recherche…</div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-ink-soft text-sm">
                Aucun client. Créez-en un avec le bouton + Nouveau.
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onPick(c)}
                      className="w-full text-left rounded-xl border border-border px-3 py-2.5 hover:border-gray-300 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{c.display_name ?? '—'}</span>
                        <span className="text-[11px] text-ink-soft uppercase tracking-wider">{c.type}</span>
                      </div>
                      <div className="text-xs text-ink-soft truncate">
                        {c.email ?? c.phone ?? '—'}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {creating && (
        <CustomerFormModal
          customer={null}
          onClose={() => setCreating(false)}
          onSaved={async (id) => {
            // Récupère le client créé pour le passer au parent
            const r = await fetch(`/api/customers?q=`);
            if (r.ok) {
              const list: PickedCustomer[] = (await r.json()).customers;
              const found = list.find((x) => x.id === id);
              if (found) onPick(found);
              else onPick({ id, display_name: 'Nouveau client', type: 'particulier', email: null, phone: null, company_name: null });
            }
          }}
        />
      )}
    </>
  );
}
