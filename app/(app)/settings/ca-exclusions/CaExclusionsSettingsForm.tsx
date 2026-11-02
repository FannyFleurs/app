'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { confirmThemed } from '@/lib/ui/dialog';
import type { CaExclusionEntry, CaExclusionsSettings } from '@/lib/settings/ca-exclusions';

interface CustomerOption { id: string; display_name: string | null }
interface PaymentMethodOption { id: string; label: string; is_active: boolean }
interface CategoryOption { id: string; name: string }

const TYPE_LABELS: Record<CaExclusionEntry['type'], string> = {
  customer: 'Client',
  payment_method: 'Mode de règlement',
  category: 'Catégorie produit',
};

export default function CaExclusionsSettingsForm({ initial, canWrite }: {
  initial: CaExclusionsSettings;
  canWrite: boolean;
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [newType, setNewType] = useState<CaExclusionEntry['type']>('customer');

  // Recherche client.
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [pickedCustomer, setPickedCustomer] = useState<CustomerOption | null>(null);

  // Modes de règlement / catégories : listes chargées une fois.
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    void (async () => {
      const [rPm, rCat] = await Promise.all([
        fetch('/api/payment-methods'),
        fetch('/api/categories'),
      ]);
      if (rPm.ok) setPaymentMethods((await rPm.json()).methods ?? []);
      if (rCat.ok) setCategories((await rCat.json()).categories ?? []);
    })();
  }, []);

  useEffect(() => {
    const q = customerQuery.trim();
    if (!q) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      if (r.ok) setCustomerResults((await r.json()).customers ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [customerQuery]);

  async function save(next: CaExclusionEntry[]) {
    const previous = entries;
    setEntries(next); // optimiste
    setSaving(true); setErr(null); setMsg(null);
    const r = await fetch('/api/settings/ca-exclusions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: next }),
    });
    setSaving(false);
    if (r.ok) {
      const j = await r.json();
      setEntries(j.settings.entries);
      setMsg('Réglages enregistrés.');
      setTimeout(() => setMsg(null), 3000);
    } else {
      setEntries(previous);
      setErr('Enregistrement impossible.');
    }
  }

  function isDuplicate(candidate: CaExclusionEntry): boolean {
    return entries.some((e) => {
      if (e.type !== candidate.type) return false;
      if (e.type === 'payment_method') return e.label.toLowerCase() === (candidate as { label: string }).label.toLowerCase();
      return (e as { id: string }).id === (candidate as { id: string }).id;
    });
  }

  function addCustomer(c: CustomerOption) {
    const entry: CaExclusionEntry = { type: 'customer', id: c.id, label: c.display_name || 'Client' };
    if (isDuplicate(entry)) { setPickedCustomer(null); setCustomerQuery(''); setCustomerResults([]); return; }
    void save([...entries, entry]);
    setPickedCustomer(null);
    setCustomerQuery('');
    setCustomerResults([]);
  }

  function addPaymentMethod() {
    const pm = paymentMethods.find((m) => m.id === selectedPaymentMethod);
    if (!pm) return;
    const entry: CaExclusionEntry = { type: 'payment_method', label: pm.label };
    if (isDuplicate(entry)) { setSelectedPaymentMethod(''); return; }
    void save([...entries, entry]);
    setSelectedPaymentMethod('');
  }

  function addCategory() {
    const cat = categories.find((c) => c.id === selectedCategory);
    if (!cat) return;
    const entry: CaExclusionEntry = { type: 'category', id: cat.id, label: cat.name };
    if (isDuplicate(entry)) { setSelectedCategory(''); return; }
    void save([...entries, entry]);
    setSelectedCategory('');
  }

  async function removeEntry(entry: CaExclusionEntry) {
    const label = entry.type === 'payment_method' ? entry.label : entry.label;
    if (!(await confirmThemed({ message: `Retirer « ${label} » des exclusions du CA boutique ?` }))) return;
    void save(entries.filter((e) => e !== entry));
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-2xl">
      <PageHeader
        title="Exclusions du CA boutique"
        subtitle="Clients, modes de règlement et catégories produit retirés du chiffre d'affaires quand le toggle « CA boutique uniquement » est activé, sur le Tableau de bord et dans l'app CA (ex. client OGF, règlement Web/Chorus, catégorie Mariage)."
        actions={null}
      />

      {msg && <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{msg}</div>}
      {err && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>}

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Exclusions configurées</h3>
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <div key={`${e.type}-${e.type === 'payment_method' ? e.label : e.id}-${i}`}
                 className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
              <span className="text-xs uppercase tracking-wider text-ink-soft w-36 shrink-0">{TYPE_LABELS[e.type]}</span>
              <span className="font-medium flex-1 truncate">{e.label}</span>
              {canWrite && (
                <button className="btn-ghost text-xs text-danger" onClick={() => void removeEntry(e)}>
                  Supprimer
                </button>
              )}
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-ink-soft">Aucune exclusion configurée pour l&apos;instant.</p>}
        </div>

        {canWrite && (
          <div className="pt-3 border-t border-border space-y-3">
            <label className="block text-sm font-medium text-ink-soft">Ajouter une exclusion</label>
            <select
              className="input h-10"
              value={newType}
              onChange={(e) => setNewType(e.target.value as CaExclusionEntry['type'])}
            >
              <option value="customer">Client</option>
              <option value="payment_method">Mode de règlement</option>
              <option value="category">Catégorie produit</option>
            </select>

            {newType === 'customer' && (
              <div className="relative">
                <input
                  className="input h-10 w-full"
                  placeholder="Rechercher un client…"
                  value={pickedCustomer ? (pickedCustomer.display_name ?? '') : customerQuery}
                  onChange={(e) => { setPickedCustomer(null); setCustomerQuery(e.target.value); }}
                />
                {customerResults.length > 0 && !pickedCustomer && (
                  <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
                    {customerResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          onClick={() => addCustomer(c)}
                        >
                          {c.display_name || 'Client sans nom'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {newType === 'payment_method' && (
              <div className="flex gap-2">
                <select
                  className="input h-10 flex-1"
                  value={selectedPaymentMethod}
                  onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                >
                  <option value="">— Choisir un mode de règlement —</option>
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}{!m.is_active ? ' (inactif)' : ''}</option>
                  ))}
                </select>
                <button className="btn-soft text-sm h-10 px-4" disabled={!selectedPaymentMethod || saving} onClick={addPaymentMethod}>
                  Ajouter
                </button>
              </div>
            )}

            {newType === 'category' && (
              <div className="flex gap-2">
                <select
                  className="input h-10 flex-1"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">— Choisir une catégorie —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button className="btn-soft text-sm h-10 px-4" disabled={!selectedCategory || saving} onClick={addCategory}>
                  Ajouter
                </button>
              </div>
            )}

            <p className="text-xs text-ink-soft">
              Un mode de règlement est comparé au libellé affiché sur le règlement au moment de l&apos;encaissement
              (un renommage ultérieur du mode ne change pas les ventes déjà réglées). Une catégorie exclut la vente
              entière dès qu&apos;un de ses articles en fait partie.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
