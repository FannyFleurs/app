'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import CustomerFormModal from '@/components/CustomerFormModal';

interface Customer {
  id: string; display_name: string | null;
  email: string | null; phone: string | null;
}

interface Props {
  saleId: string;
  onClose: () => void;
  onSuccess: (loyalty: { earned: number; new_balance: number } | null) => void;
}

export default function AttachCustomerAfterSaleModal({ saleId, onClose, onSuccess }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const r = await fetch(`/api/customers?${params.toString()}`);
      if (r.ok) {
        const j = await r.json();
        setResults(j.customers);
      }
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function attach(customerId: string) {
    setSubmitting(true); setError(null);
    const r = await fetch(`/api/sales/${saleId}/attach-customer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    onSuccess(j.loyalty);
  }

  return (
    <>
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Attribuer un client</h2>
            <p className="text-sm text-ink-soft">La fidélité sera calculée automatiquement.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-soft text-sm h-9 px-3 whitespace-nowrap"
                    onClick={() => setCreating(true)}>
              + Nouveau
            </button>
            <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
          </div>
        </div>

        <input
          autoFocus
          className="input"
          placeholder="Nom, email, téléphone, SIRET…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />

        <div className="mt-3 max-h-[50vh] overflow-auto">
          {loading ? (
            <div className="py-8 text-center text-ink-soft text-sm">Recherche…</div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-ink-soft text-sm">Aucun résultat.</div>
          ) : (
            <ul className="space-y-1">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => void attach(c.id)}
                    disabled={submitting}
                    className="w-full text-left rounded-xl border border-border px-3 py-2.5 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <div className="font-medium">{c.display_name ?? '—'}</div>
                    <div className="text-xs text-ink-soft truncate">{c.email ?? c.phone ?? '—'}</div>
                  </button>
                </li>
              ))}
            </ul>
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
