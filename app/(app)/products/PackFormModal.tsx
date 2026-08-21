'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';
import { MAX_PACK_ITEMS } from '@/lib/products/pack';

interface PackItem { product_id: string; name: string; price: number; quantity: number }

interface SearchResult { id: string; name: string; sale_price_ttc: number; is_pack: boolean }

/**
 * Création / édition d'un PACK d'articles : on choisit des produits existants
 * (recherche, jusqu'à 5), le prix se calcule automatiquement, avec une remise
 * possible sur le pack. Pas de stock propre : à la vente, le pack éclate en ses
 * composants (décomptés chacun de leur stock).
 */
export default function PackFormModal({
  packId, onClose, onSaved, inline = false,
}: {
  packId?: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  inline?: boolean;
}) {
  const [name, setName] = useState('');
  const [visibleInPos, setVisibleInPos] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<PackItem[]>([]);
  const [discount, setDiscount] = useState('');
  const [loading, setLoading] = useState(!!packId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recherche de composants
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Chargement pour l'édition
  useEffect(() => {
    if (!packId) return;
    void (async () => {
      try {
        const r = await fetch(`/api/products/packs/${packId}`);
        if (r.ok) {
          const { pack } = await r.json();
          setName(pack.name ?? '');
          setVisibleInPos(!!pack.visible_in_pos);
          setIsActive(!!pack.is_active);
          setDiscount(pack.pack_discount_ttc ? String(pack.pack_discount_ttc) : '');
          setItems((pack.items ?? []).map((i: { product_id: string; name: string; sale_price_ttc: number; quantity: number }) => ({
            product_id: i.product_id, name: i.name, price: i.sale_price_ttc, quantity: i.quantity,
          })));
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  // Recherche produits (débouncée)
  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/products?q=${encodeURIComponent(q)}&active=true`);
        if (r.ok) {
          const j = await r.json();
          const list: SearchResult[] = (j.products ?? j.rows ?? j ?? []).map((p: { id: string; name: string; sale_price_ttc: number | string; is_pack?: boolean }) => ({
            id: p.id, name: p.name, sale_price_ttc: Number(p.sale_price_ttc), is_pack: !!p.is_pack,
          }));
          setResults(list.filter((p) => !p.is_pack && !items.some((it) => it.product_id === p.id)).slice(0, 25));
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, searchOpen, items]);

  const total = useMemo(() => round2(items.reduce((s, i) => s + i.price * i.quantity, 0)), [items]);
  const discountNum = Math.max(0, Number(discount.replace(',', '.')) || 0);
  const finalPrice = round2(Math.max(0, total - discountNum));

  function addItem(p: SearchResult) {
    if (items.length >= MAX_PACK_ITEMS) return;
    setItems((cur) => [...cur, { product_id: p.id, name: p.name, price: p.sale_price_ttc, quantity: 1 }]);
    setQ('');
  }
  function removeItem(id: string) { setItems((cur) => cur.filter((i) => i.product_id !== id)); }
  function setQty(id: string, qty: number) {
    setItems((cur) => cur.map((i) => (i.product_id === id ? { ...i, quantity: Math.max(1, qty || 1) } : i)));
  }

  async function save() {
    setError(null);
    if (!name.trim()) { setError('Donnez un nom au pack.'); return; }
    if (items.length === 0) { setError('Ajoutez au moins un produit au pack.'); return; }
    setSaving(true);
    const body = {
      name: name.trim(),
      visible_in_pos: visibleInPos,
      is_active: isActive,
      discount_ttc: discountNum,
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    };
    const r = await fetch(packId ? `/api/products/packs/${packId}` : '/api/products/packs', {
      method: packId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Enregistrement impossible.');
      return;
    }
    const j = await r.json();
    onSaved(j.id ?? packId ?? '');
  }

  return (
    <div className={inline
      ? 'p-4 sm:p-6'
      : 'fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-2 md:p-4'}>
      <div className={inline
        ? 'card w-full overflow-hidden'
        : 'card w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden'}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">{packId ? 'Modifier le pack' : 'Nouveau pack'}</h2>
          <button onClick={onClose} aria-label={inline ? 'Fermer la fiche' : 'Fermer'}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border text-ink-soft hover:bg-gray-50">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-ink-soft">Chargement…</div>
        ) : (
          <div className={inline ? 'p-5 space-y-4' : 'flex-1 overflow-y-auto p-5 space-y-4'}>
            <label className="block text-sm">
              <span className="text-ink-soft">Nom du pack *</span>
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Coffret cadeau naissance" />
            </label>

            {/* Composition */}
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">Composition <span className="text-ink-soft">({items.length}/{MAX_PACK_ITEMS})</span></div>
                <button type="button" className="btn-soft text-sm"
                        disabled={items.length >= MAX_PACK_ITEMS}
                        onClick={() => setSearchOpen((v) => !v)}>
                  + Ajouter des produits
                </button>
              </div>

              {searchOpen && (
                <div className="mt-3 rounded-lg border border-border bg-gray-50 p-2">
                  <input autoFocus className="input" placeholder="Rechercher un produit…" value={q} onChange={(e) => setQ(e.target.value)} />
                  <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-border rounded-lg bg-white border border-border">
                    {searching ? (
                      <div className="p-3 text-sm text-ink-soft">Recherche…</div>
                    ) : results.length === 0 ? (
                      <div className="p-3 text-sm text-ink-soft">{q ? 'Aucun produit.' : 'Tapez pour rechercher.'}</div>
                    ) : results.map((p) => (
                      <button key={p.id} type="button" onClick={() => addItem(p)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                        <span className="truncate">{p.name}</span>
                        <span className="text-ink-soft ml-3 shrink-0">{formatEUR(p.sale_price_ttc)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                  <p className="text-sm text-ink-soft">Aucun produit. Cliquez sur « Ajouter des produits ».</p>
                ) : items.map((i) => (
                  <div key={i.product_id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="flex-1 truncate text-sm">{i.name}</span>
                    <input type="number" min={1} className="input h-8 w-16 text-sm" value={i.quantity}
                           onChange={(e) => setQty(i.product_id, Number(e.target.value))} aria-label="Quantité" />
                    <span className="w-20 text-right text-sm text-ink-soft">{formatEUR(round2(i.price * i.quantity))}</span>
                    <button type="button" className="text-ink-soft hover:text-danger" onClick={() => removeItem(i.product_id)} aria-label="Retirer">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Prix */}
            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">Total des produits</span>
                <span className="font-medium">{formatEUR(total)}</span>
              </div>
              <label className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">Remise sur le pack (€)</span>
                <input type="number" min={0} step="0.01" className="input h-8 w-28 text-right text-sm"
                       value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </label>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="font-medium">Prix du pack</span>
                <span className="text-lg font-semibold">{formatEUR(finalPrice)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={visibleInPos} onChange={(e) => setVisibleInPos(e.target.checked)} /> Visible en caisse
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Actif
              </label>
            </div>

            {error && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
          </div>
        )}

        <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={saving || loading} onClick={() => void save()}>
            {saving ? 'Enregistrement…' : packId ? 'Enregistrer' : 'Créer le pack'}
          </button>
        </div>
      </div>
    </div>
  );
}
