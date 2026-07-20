'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { useBrand } from '@/components/BrandMark';
import LabelPrintModal from '@/app/(app)/products/LabelPrintModal';
import type { LabelProduct } from '@/lib/services/label-print';

interface Product extends LabelProduct {
  id: string;
}

export default function PrintLabelApp({ userName }: { userName: string }) {
  const brand = useBrand();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Chargement du catalogue (articles actifs). On garde les champs utiles à
  // l'étiquette (nom, sku, code-barres, prix, remise).
  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/products?active=true');
      if (r.ok) {
        const j = await r.json();
        setProducts((j.products as Array<Record<string, unknown>>).map((p) => ({
          id: String(p.id),
          name: String(p.name),
          sku: (p.sku as string) ?? null,
          barcode: (p.barcode as string) ?? null,
          sale_price_ttc: Number(p.sale_price_ttc),
          discount_type: (p.discount_type as 'percent' | 'amount' | null) ?? null,
          discount_value: p.discount_value != null ? Number(p.discount_value) : null,
        })));
      }
      setLoading(false);
    })();
  }, []);

  // Garde le focus sur le champ de recherche : le scanner PDA « tape » le
  // code-barres puis Entrée dans ce champ.
  useEffect(() => {
    if (!selected) searchRef.current?.focus();
  }, [selected, loading]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(s)
      || (p.sku?.toLowerCase().includes(s) ?? false)
      || (p.barcode?.toLowerCase().includes(s) ?? false),
    );
  }, [products, q]);

  // Scan / Entrée : correspondance exacte code-barres ou SKU en priorité,
  // sinon si un seul résultat filtré, on l'ouvre.
  function onSubmit() {
    const s = q.trim();
    if (!s) return;
    const exact = products.find(
      (p) => p.barcode === s || p.sku === s || p.barcode === s.toUpperCase(),
    );
    if (exact) { openProduct(exact); return; }
    if (filtered.length === 1) { openProduct(filtered[0]!); return; }
  }

  function openProduct(p: Product) {
    setSelected(p);
    setQ('');
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.assign('/login');
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink">
      {/* En-tête */}
      <header className="shrink-0 h-16 border-b border-border bg-surface flex items-center gap-3 px-4">
        {brand.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo_url} alt={brand.brand_name} className="h-9 w-auto max-w-[150px] object-contain" />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">
            {(brand.brand_name || 'H').charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">Impression étiquettes</div>
          <div className="text-xs text-ink-soft truncate">{userName}</div>
        </div>
        <button
          onClick={() => void logout()}
          className="ml-auto text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-lg hover:bg-gray-100"
        >
          Quitter
        </button>
      </header>

      {/* Recherche / scan */}
      <div className="shrink-0 p-3 border-b border-border bg-surface">
        <input
          ref={searchRef}
          className="input h-14 text-lg w-full"
          placeholder="Scanner un code-barres ou rechercher un article…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } }}
          autoFocus
          autoComplete="off"
          // Évite le clavier auto sur certains PDA quand on veut juste scanner :
          // on garde inputMode texte pour permettre aussi la saisie manuelle.
          enterKeyHint="search"
        />
      </div>

      {/* Liste des articles */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-sm text-ink-soft">Chargement du catalogue…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-ink-soft">Aucun article trouvé.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => openProduct(p)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-gray-100 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-ink-soft truncate">
                      {p.barcode ? `⛏ ${p.barcode}` : '— pas de code-barres —'}
                      {p.sku ? ` · ${p.sku}` : ''}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums whitespace-nowrap">
                    {formatEUR(p.sale_price_ttc)}
                  </div>
                  <span className="text-accent-deep text-sm shrink-0">🏷</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <LabelPrintModal product={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
