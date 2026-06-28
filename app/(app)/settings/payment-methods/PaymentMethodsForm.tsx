'use client';

import { useEffect, useState } from 'react';

interface PaymentMethod {
  id: string;
  code: string;
  kind: string;
  label: string;
  is_active: boolean;
  position: number;
}

const PM_KIND_OPTIONS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte bancaire' },
  { value: 'check', label: 'Chèque' },
  { value: 'transfer', label: 'Virement' },
  { value: 'gift_card', label: 'Carte cadeau' },
  { value: 'credit_note', label: 'Avoir' },
  { value: 'payment_link', label: 'Lien de paiement Stripe' },
  { value: 'deferred', label: 'Différé client' },
  { value: 'other', label: 'Autre' },
];

export default function PaymentMethodsForm({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState('other');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/payment-methods');
    if (r.ok) setItems((await r.json()).methods);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(id: string, is_active: boolean) {
    await fetch(`/api/payment-methods/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    });
    void load();
  }
  async function rename(id: string, label: string) {
    await fetch(`/api/payment-methods/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    void load();
  }
  async function add() {
    if (!newLabel.trim()) return;
    await fetch('/api/payment-methods', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim(), kind: newKind }),
    });
    setNewLabel('');
    void load();
  }

  return (
    <div className="p-8 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modes de règlement</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Activer / désactiver et renommer les moyens de paiement disponibles en caisse.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        {loading ? (
          <p className="text-sm text-ink-soft">Chargement…</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
                <span className="text-xs uppercase tracking-wider w-20 text-ink-soft">{m.kind}</span>
                <input
                  className="input h-9 flex-1"
                  defaultValue={m.label}
                  disabled={!canWrite}
                  onBlur={(e) => e.target.value !== m.label && void rename(m.id, e.target.value)}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox" checked={m.is_active}
                    disabled={!canWrite}
                    onChange={(e) => void toggle(m.id, e.target.checked)}
                  />
                  Actif
                </label>
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div className="mt-3 flex items-center gap-2">
            <input
              className="input h-9 flex-1" placeholder="Nouveau libellé"
              value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            />
            <select
              className="input h-9 max-w-[160px]" value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
            >
              {PM_KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <button className="btn-soft text-sm" onClick={() => void add()} disabled={!newLabel.trim()}>
              + Ajouter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
