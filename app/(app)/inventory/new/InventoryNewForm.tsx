'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  stores: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  suppliers: { supplier_ref: string; product_count: number }[];
  /** Poste de caisse appairé : inventaire verrouillé sur sa boutique. */
  lockedStoreId?: string | null;
}

type Scope = 'total' | 'category' | 'supplier';

export default function InventoryNewForm({ stores, categories, suppliers, lockedStoreId }: Props) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(lockedStoreId ?? stores[0]?.id ?? '');
  const [label, setLabel] = useState(
    `Inventaire ${new Date().toLocaleDateString('fr-FR')}`,
  );
  const [scope, setScope] = useState<Scope>('total');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!storeId) { setErr('Boutique obligatoire.'); return; }
    if (!label.trim()) { setErr('Libellé obligatoire.'); return; }
    if (scope !== 'total' && selected.size === 0) {
      setErr('Sélectionnez au moins un élément.'); return;
    }
    setSaving(true); setErr(null);
    const r = await fetch('/api/inventories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label.trim(),
        store_id: storeId,
        scope_type: scope,
        scope_ids: scope === 'total' ? [] : Array.from(selected),
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const { id } = await r.json();
    router.push(`/inventory/${id}`);
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="text-sm text-ink-soft hover:text-ink">← Inventaires</Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nouvel inventaire</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Choisissez la boutique et la portée. Les lignes attendues seront
          pré-remplies avec le stock actuel.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Libellé</label>
            <input
              className="input mt-1 h-12 text-base"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
            />
          </div>
          {!lockedStoreId && (
            <div>
              <label className="text-xs font-medium text-ink-soft">Boutique</label>
              <select
                className="input mt-1 h-12 text-base"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-ink-soft">Portée</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['total', 'category', 'supplier'] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setScope(s); setSelected(new Set()); }}
                className={`rounded-xl h-14 text-base font-semibold border transition-colors ${
                  scope === s
                    ? 'accent-bar text-white border-transparent'
                    : 'bg-white border-border text-ink'
                }`}
              >
                {s === 'total' ? 'Total' : s === 'category' ? 'Par catégorie' : 'Par fournisseur'}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {scope === 'total'
              ? 'Tous les produits actifs de la boutique.'
              : scope === 'category'
                ? 'Uniquement les produits des catégories cochées.'
                : 'Uniquement les produits associés aux fournisseurs cochés.'}
          </p>
        </div>

        {scope === 'category' && (
          <div>
            <div className="text-xs font-medium text-ink-soft mb-2">Catégories</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="col-span-full text-xs text-ink-soft">Aucune catégorie.</div>
              ) : categories.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                    selected.has(c.id)
                      ? 'border-transparent bg-accent-soft'
                      : 'border-border bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm truncate">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {scope === 'supplier' && (
          <div>
            <div className="text-xs font-medium text-ink-soft mb-2">Fournisseurs</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {suppliers.length === 0 ? (
                <div className="col-span-full text-xs text-ink-soft">
                  Aucun fournisseur renseigné sur les produits.
                </div>
              ) : suppliers.map((s) => (
                <label
                  key={s.supplier_ref}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                    selected.has(s.supplier_ref)
                      ? 'border-transparent bg-accent-soft'
                      : 'border-border bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.supplier_ref)}
                    onChange={() => toggle(s.supplier_ref)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm truncate">
                    {s.supplier_ref}
                    <span className="text-ink-soft text-xs ml-1">· {s.product_count}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>
      )}

      <div className="flex justify-end gap-2">
        <Link href="/inventory" className="btn-ghost h-12 text-base px-5 inline-flex items-center">
          Annuler
        </Link>
        <button
          onClick={() => void submit()}
          disabled={saving}
          className="btn-primary h-12 text-base font-semibold px-6"
        >
          {saving ? 'Création…' : 'Créer et commencer le comptage'}
        </button>
      </div>
    </div>
  );
}
