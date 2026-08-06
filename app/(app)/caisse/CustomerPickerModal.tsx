'use client';

import { useEffect, useState } from 'react';
import CustomerFormModal from '@/components/CustomerFormModal';
import { useSchoolMode, schoolCustomers, addSchoolCustomer } from '@/lib/school-mode';

export interface PickedCustomer {
  id: string;
  display_name: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  default_discount_pct: number | null;
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
  // Liste masquée par défaut : on ne charge/affiche les clients que lors d'une
  // recherche OU si l'on demande explicitement « Afficher la liste ».
  const [showList, setShowList] = useState(false);
  const schoolMode = useSchoolMode();
  // Fiches inventées pendant la démonstration : elles s'ajoutent aux vrais
  // clients, qu'on peut toujours sélectionner puisqu'on ne fait que les lire.
  const [demo, setDemo] = useState<PickedCustomer[]>([]);
  useEffect(() => { if (schoolMode) setDemo(schoolCustomers()); }, [schoolMode]);

  useEffect(() => {
    const query = q.trim();
    // Rien à afficher tant qu'on ne recherche pas et qu'on n'a pas demandé la liste.
    if (!query && !showList) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const res = await fetch(`/api/customers?${params.toString()}`);
      if (res.ok) {
        const j = await res.json();
        setResults(j.customers);
      }
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, showList]);

  const needle = q.trim().toLowerCase();
  const shown: PickedCustomer[] = [
    ...demo.filter((c) => !needle || [c.display_name, c.phone, c.email, c.company_name]
      .some((f) => f?.toLowerCase().includes(needle))),
    ...results,
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
        <div className="card max-w-xl w-full p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Sélectionner un client</h2>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
            >✕</button>
          </div>

          <div className="flex gap-2">
            <input
              autoFocus
              // iOS Safari : coupe la barre « Remplissage auto / Contacts »
              // qui s'invitait sur ce champ (placeholder « Nom, email… »).
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              name="customer-search"
              className="input flex-1 h-12 text-base"
              placeholder="Nom ou téléphone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn-soft whitespace-nowrap h-12 text-base px-4" onClick={() => setCreating(true)}>
              + Nouveau
            </button>
          </div>

          <div className="mt-3 max-h-[55vh] overflow-auto -mx-1 px-1">
            {!q.trim() && !showList ? (
              <div className="py-8 text-center">
                <p className="text-sm text-ink-soft mb-3">
                  Recherchez un client par nom ou numéro de téléphone.
                </p>
                <button className="btn-soft h-11 px-4 text-base" onClick={() => setShowList(true)}>
                  Afficher la liste
                </button>
              </div>
            ) : (
              <>
                {/* Liste ouverte sans recherche : bouton pour la masquer. */}
                {showList && !q.trim() && (
                  <div className="flex justify-end mb-2">
                    <button className="btn-ghost text-sm h-9 px-3" onClick={() => setShowList(false)}>
                      Masquer la liste
                    </button>
                  </div>
                )}
                {loading ? (
                  <div className="py-8 text-center text-ink-soft text-sm">Recherche…</div>
                ) : shown.length === 0 ? (
                  <div className="py-8 text-center text-ink-soft text-sm">
                    Aucun client. Créez-en un avec le bouton + Nouveau.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                {shown.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onPick(c)}
                      className="w-full text-left rounded-xl border border-border px-4 py-3 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate text-base">{c.display_name ?? '—'}</span>
                        <span className="text-[11px] text-ink-soft uppercase tracking-wider">{c.type}</span>
                      </div>
                      <div className="text-sm text-ink-soft truncate">
                        {c.email ?? c.phone ?? '—'}
                      </div>
                    </button>
                  </li>
                ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {creating && (
        <CustomerFormModal
          customer={null}
          localOnly={schoolMode}
          onClose={() => setCreating(false)}
          onSaved={async (id, draft) => {
            // Mode école : la fiche n'a pas été enregistrée, on la garde ici
            // le temps de la démonstration et on l'attache tout de suite.
            if (schoolMode && draft) {
              const created = addSchoolCustomer({
                display_name: draft.company_name
                  || [draft.first_name, draft.last_name].filter(Boolean).join(' ')
                  || 'Client',
                type: draft.type,
                email: draft.email,
                phone: draft.phone,
                company_name: draft.company_name,
                default_discount_pct: draft.default_discount_pct,
              });
              setDemo((cur) => [created, ...cur]);
              onPick(created);
              return;
            }
            // Récupère le client créé pour le passer au parent
            const r = await fetch(`/api/customers?q=`);
            if (r.ok) {
              const list: PickedCustomer[] = (await r.json()).customers;
              const found = list.find((x) => x.id === id);
              if (found) onPick(found);
              else onPick({ id, display_name: 'Nouveau client', type: 'particulier', email: null, phone: null, company_name: null, default_discount_pct: null });
            }
          }}
        />
      )}
    </>
  );
}
