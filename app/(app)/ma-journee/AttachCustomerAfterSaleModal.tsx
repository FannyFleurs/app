'use client';

import { useEffect, useState } from 'react';
import CustomerFormModal from '@/components/CustomerFormModal';

interface Customer {
  id: string; display_name: string | null;
  email: string | null; phone: string | null;
}

interface Props {
  saleId: string;
  /** Nom du client déjà attaché, si on remplace plutôt qu'on attribue
   *  (affiche « Changer de client » au lieu de « Attribuer un client »). */
  currentCustomerName?: string | null;
  onClose: () => void;
  onSuccess: (loyalty: { earned: number; new_balance: number } | null) => void;
}

const ERROR_LABELS: Record<string, string> = {
  INVOICE_ALREADY_GENERATED: 'Une facture a déjà été émise pour cette vente : le client ne peut plus être changé.',
  SALE_NOT_VALIDATED: 'Cette vente n\'est plus modifiable.',
  CUSTOMER_NOT_FOUND: 'Client introuvable.',
};

export default function AttachCustomerAfterSaleModal({
  saleId, currentCustomerName, onClose, onSuccess,
}: Props) {
  const isChange = !!currentCustomerName;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Liste masquée par défaut, même principe que la recherche client en
  // caisse (CustomerPickerModal) : on ne charge/affiche les clients que lors
  // d'une recherche OU si on demande explicitement « Afficher la liste ».
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    const query = q.trim();
    // Rien à afficher tant qu'on ne recherche pas et qu'on n'a pas demandé la liste.
    if (!query && !showList) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const r = await fetch(`/api/customers?${params.toString()}`);
      if (r.ok) {
        const j = await r.json();
        setResults(j.customers);
      }
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, showList]);

  async function attach(customerId: string) {
    setSubmitting(true); setError(null);
    const r = await fetch(`/api/sales/${saleId}/attach-customer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const code = j.error as string | undefined;
      setError((code && ERROR_LABELS[code]) ?? j.message ?? code ?? 'Erreur');
      return;
    }
    const j = await r.json();
    onSuccess(j.loyalty);
  }

  return (
    <>
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-xl w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{isChange ? 'Changer de client' : 'Attribuer un client'}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>
        <p className="text-sm text-ink-soft mb-3">
          {isChange
            ? <>Client actuel : <strong className="text-ink">{currentCustomerName}</strong>. La fidélité sera recalculée automatiquement.</>
            : 'La fidélité sera calculée automatiquement.'}
        </p>

        <div className="flex gap-2">
          <input
            autoFocus
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

        <div className="mt-3 max-h-[50vh] overflow-auto -mx-1 px-1">
          {!q.trim() && !showList ? (
            <div className="py-8 text-center">
              <p className="text-sm text-ink-soft mb-3">
                Recherchez un client par nom ou numéro de téléphone.
              </p>
              <button
                className="btn-soft h-11 px-4 text-base"
                onClick={() => setShowList(true)}
              >
                Afficher la liste
              </button>
            </div>
          ) : (
            <>
              {showList && !q.trim() && (
                <div className="flex justify-end mb-2">
                  <button className="btn-ghost text-sm h-9 px-3" onClick={() => setShowList(false)}>
                    Masquer la liste
                  </button>
                </div>
              )}
              {loading ? (
                <div className="py-8 text-center text-ink-soft text-sm">Recherche…</div>
              ) : results.length === 0 ? (
                <div className="py-8 text-center text-ink-soft text-sm">
                  Aucun client. Créez-en un avec le bouton + Nouveau.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => void attach(c.id)}
                        disabled={submitting}
                        className="w-full text-left rounded-xl border border-border px-4 py-3 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] disabled:opacity-60"
                      >
                        <div className="font-semibold truncate text-base">{c.display_name ?? '—'}</div>
                        <div className="text-sm text-ink-soft truncate">{c.email ?? c.phone ?? '—'}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      </div>
    </div>

    {creating && (
      <CustomerFormModal
        customer={null}
        onClose={() => setCreating(false)}
        onSaved={(id) => { setCreating(false); void attach(id); }}
      />
    )}
    </>
  );
}
