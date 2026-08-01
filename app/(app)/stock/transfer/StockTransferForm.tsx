'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface Store { id: string; name: string }
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null; extra_barcodes?: string[] | null;
  store_ids?: string[];
}
interface StockRow { product_id: string; quantity: number }

const CURRENT_STORE_KEY = 'webpos_current_store_id';

export default function StockTransferForm({ stores }: { stores: Store[] }) {
  // Boutique source = celle "connectee" (persistee entre les caisses via
  // localStorage). Fallback = premiere boutique de la liste.
  const [fromStoreId, setFromStoreId] = useState<string>('');
  const [toStoreId, setToStoreId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    product_name: string; quantity: number;
    from_qty_after: number; to_qty_after: number;
    auto_added_to_destination: boolean;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Boutique par defaut = celle stockee en localStorage (choix courant
  // de la caisse) OU la premiere.
  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? localStorage.getItem(CURRENT_STORE_KEY)
      : null;
    const src = (saved && stores.find((s) => s.id === saved)?.id) ?? stores[0]?.id ?? '';
    setFromStoreId(src);
    // Destination = premiere autre boutique.
    const dst = stores.find((s) => s.id !== src)?.id ?? '';
    setToStoreId(dst);
  }, [stores]);

  // Garde-fou : si la source change et devient egale a la destination,
  // on repositionne la destination sur la premiere autre boutique.
  useEffect(() => {
    if (!fromStoreId) return;
    if (!toStoreId || toStoreId === fromStoreId) {
      const dst = stores.find((s) => s.id !== fromStoreId)?.id ?? '';
      setToStoreId(dst);
    }
  }, [fromStoreId, toStoreId, stores]);

  // Recharge les produits + le stock de la boutique source.
  useEffect(() => {
    if (!fromStoreId) return;
    void (async () => {
      const rP = await fetch(`/api/products?store_id=${fromStoreId}`);
      if (rP.ok) setProducts((await rP.json()).products);
      // Le stock est expose par produit via /api/stock/levels ; ici on
      // charge tous les niveaux de la source et on indexe par product_id.
      const rS = await fetch(`/api/stock/levels?store_id=${fromStoreId}`);
      if (rS.ok) {
        const j = await rS.json() as { levels: StockRow[] };
        const map: Record<string, number> = {};
        for (const l of j.levels ?? []) map[l.product_id] = Number(l.quantity);
        setStock(map);
      }
    })();
  }, [fromStoreId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) =>
      p.name.toLowerCase().includes(q)
      || p.sku?.toLowerCase().includes(q)
      || p.barcode === search.trim() || p.barcode === search.trim().toUpperCase()
      || (p.extra_barcodes?.some((b) => b === search.trim() || b.toUpperCase() === search.trim().toUpperCase()) ?? false),
    ).slice(0, 30);
  }, [products, search]);

  const currentProduct = products.find((p) => p.id === productId);
  const currentStock = productId ? (stock[productId] ?? 0) : 0;

  async function submit() {
    if (!productId || !fromStoreId || !toStoreId) {
      setError('Renseignez toutes les informations.');
      return;
    }
    if (fromStoreId === toStoreId) {
      setError('Boutique source et destination identiques.');
      return;
    }
    if (quantity <= 0) { setError('Quantité invalide.'); return; }
    if (quantity > currentStock) {
      setError(`Stock insuffisant à la source (${currentStock} disponible).`);
      return;
    }
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/stock/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          from_store_id: fromStoreId,
          to_store_id: toStoreId,
          quantity,
          reason: reason.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(prettyError(j.error) || j.message || 'Erreur');
        return;
      }
      const j = await r.json();
      setResult(j);
      // reset ligne : garde les boutiques + reason, vide produit + qty
      setProductId(''); setQuantity(1); setSearch('');
      // Recharge le stock a la source pour refleter le decrement
      const rS = await fetch(`/api/stock/levels?store_id=${fromStoreId}`);
      if (rS.ok) {
        const j = await rS.json() as { levels: StockRow[] };
        const map: Record<string, number> = {};
        for (const l of j.levels ?? []) map[l.product_id] = Number(l.quantity);
        setStock(map);
      }
      searchRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function switchStores() {
    setFromStoreId(toStoreId);
    setToStoreId(fromStoreId);
    setProductId(''); setSearch('');
  }

  const canSubmit = productId && fromStoreId && toStoreId
    && fromStoreId !== toStoreId && quantity > 0 && quantity <= currentStock;

  return (
    <div className="p-6 md:p-8 w-full space-y-5">
      <PageHeader
        title="Transfert de stock"
        subtitle="Déplacez du stock d'une boutique à l'autre. Si le produit n'est pas encore disponible dans la boutique destination, il y est ajouté automatiquement."
        actions={<Link href="/stock" className="btn-ghost text-sm">← Stock</Link>}
      />

      {/* Boutiques — pleine largeur en haut */}
      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-ink-soft">Depuis</label>
            <select
              className="input mt-1 h-12 text-base w-full"
              value={fromStoreId}
              onChange={(e) => { setFromStoreId(e.target.value); setProductId(''); }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={switchStores}
            className="h-12 sm:w-12 w-full grid place-items-center rounded-xl border border-border hover:bg-gray-50 text-ink-soft"
            title="Inverser"
            aria-label="Inverser les boutiques"
          >⇄</button>
          <div>
            <label className="text-xs font-medium text-ink-soft">Vers</label>
            <select
              className="input mt-1 h-12 text-base w-full"
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
            >
              {stores.filter((s) => s.id !== fromStoreId).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2 colonnes en desktop : produit a gauche, quantite+motif+resume a droite */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 items-start">
        <div className="space-y-5">

      {/* Recherche produit */}
      <div className="card p-5 space-y-3">
        <label className="text-xs font-medium text-ink-soft">Produit</label>
        <input
          ref={searchRef}
          autoFocus
          className="input h-12 text-base"
          placeholder="Rechercher par nom, SKU ou code-barres…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 space-y-1">
          {filtered.map((p) => {
            const isSelected = p.id === productId;
            const qty = stock[p.id] ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProductId(p.id)}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                  isSelected ? 'bg-accent-soft border-transparent'
                             : 'bg-white border-border hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{p.name}</span>
                  <span className={`text-sm tabular-nums ${qty > 0 ? 'text-ink-soft' : 'text-danger'}`}>
                    {qty} en stock
                  </span>
                </div>
                {(p.sku || p.barcode) && (
                  <div className="text-xs text-ink-soft font-mono truncate">
                    {p.sku ?? p.barcode ?? ''}
                  </div>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-ink-soft text-center py-4">Aucun produit.</p>
          )}
        </div>
      </div>

        </div>

        {/* Colonne droite : quantite, motif, feedback */}
        <div className="space-y-4 lg:sticky lg:top-4 self-start">

      {/* Quantité + motif */}
      {currentProduct ? (
        <div className="card p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="font-medium">{currentProduct.name}</div>
            <div className="text-sm text-ink-soft">Stock source : <strong>{currentStock}</strong></div>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Quantité à transférer</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="h-12 w-12 rounded-xl border border-border bg-white text-xl font-medium"
              >−</button>
              <input
                type="number"
                min={1}
                max={currentStock}
                step="0.001"
                className="input h-12 flex-1 text-2xl font-semibold text-center tabular-nums"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(currentStock, q + 1))}
                className="h-12 w-12 rounded-xl border border-border bg-white text-xl font-medium"
              >+</button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Motif (facultatif)</label>
            <input
              className="input mt-1 h-12"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex : réassort boutique, dépannage…"
              maxLength={200}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Link href="/stock" className="btn-ghost h-12 text-base px-5 inline-flex items-center">
              Terminer
            </Link>
            <button
              onClick={() => void submit()}
              disabled={!canSubmit || busy}
              className="btn-primary h-12 text-base font-semibold px-6"
            >
              {busy ? 'Transfert…' : `Transférer ${quantity > 0 ? quantity : ''}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center text-sm text-ink-soft">
          Sélectionnez un produit dans la liste à gauche pour définir la quantité à transférer.
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {result && (
        <div className="rounded-xl bg-success/10 px-3 py-3 text-sm text-success">
          ✓ {result.quantity} × <strong>{result.product_name}</strong> transféré.
          Stock source : <strong>{result.from_qty_after}</strong> · destination : <strong>{result.to_qty_after}</strong>.
          {result.auto_added_to_destination && (
            <div className="text-xs mt-1">
              Le produit a été ajouté automatiquement à la boutique destination.
            </div>
          )}
        </div>
      )}

        </div>
      </div>
    </div>
  );
}

function prettyError(code?: string): string {
  switch (code) {
    case 'INSUFFICIENT_STOCK': return 'Stock insuffisant à la source.';
    case 'PRODUCT_NOT_FOUND':  return 'Produit introuvable.';
    case 'STORE_NOT_FOUND':    return 'Boutique introuvable.';
    default: return code ?? '';
  }
}
