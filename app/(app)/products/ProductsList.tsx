'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import ProductFormModal from './ProductFormModal';
import ProductImportModal from './ProductImportModal';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface Product {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null;
  sale_price_ttc: number; price_is_free: boolean;
  tax_rate: number; tax_rate_id: string; tax_rate_code: string;
  category_id: string | null; category_name: string | null;
  supplier_id: string | null; supplier_name: string | null;
  discount_type: 'percent' | 'amount' | null; discount_value: number | null;
  visible_in_pos: boolean; is_active: boolean;
  is_seasonal: boolean; is_customizable: boolean;
  is_top_product?: boolean;
  store_ids: string[];
  tags: string[];
}

export default function ProductsList({
  canEdit, taxRates, categories,
}: {
  canEdit: boolean;
  taxRates: { id: string; code: string; rate: number; label: string; is_default: boolean }[];
  categories: { id: string; name: string }[];
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  // editing: undefined = rien affiché, null = nouveau produit, Product = édition.
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [onlyTop, setOnlyTop] = useState(false);

  async function reload() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (showInactive) params.set('active', 'false');
    const res = await fetch(`/api/products?${params.toString()}`);
    if (res.ok) {
      const j = await res.json();
      setProducts(j.products.map((p: Product) => ({
        ...p, sale_price_ttc: Number(p.sale_price_ttc), tax_rate: Number(p.tax_rate),
        store_ids: p.store_ids ?? [],
      })));
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showInactive]);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/me');
      if (r.ok) setStores((await r.json()).stores ?? []);
    })();
  }, []);

  const storeName = useMemo(
    () => new Map(stores.map((s) => [s.id, s.name])),
    [stores],
  );

  const filtered = useMemo(() => {
    let arr = products;
    if (filterCat !== 'all') arr = arr.filter((p) => p.category_id === filterCat);
    if (onlyTop) arr = arr.filter((p) => p.is_top_product);
    // Verrouillage boutique : un article limité à certaines boutiques
    // (store_ids non vide) n'apparaît que pour ces boutiques. store_ids vide
    // = disponible dans TOUTES les boutiques.
    if (filterStore) {
      arr = arr.filter((p) => p.store_ids.length === 0 || p.store_ids.includes(filterStore));
    }
    return arr;
  }, [products, filterCat, onlyTop, filterStore]);

  const stats = useMemo(() => ({
    total: products.length,
    inPos: products.filter((p) => p.visible_in_pos).length,
    scoped: products.filter((p) => p.store_ids.length > 0).length,
    top: products.filter((p) => p.is_top_product).length,
  }), [products]);

  const activeId = editing && 'id' in editing ? editing.id : null;

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Produits"
          subtitle="Catalogue complet : bouquets, plantes, cache-pots, bougies, services, cartes cadeaux."
          actions={canEdit ? (
            <div className="flex gap-2">
              <button className="btn-soft" onClick={() => setShowImport(true)}>⬆ Importer</button>
              <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau produit</button>
            </div>
          ) : null}
        />
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Kpi label="Références" value={stats.total.toString()} />
          <Kpi label="Visibles en caisse" value={stats.inPos.toString()} />
          <Kpi label="Top produits" value={stats.top.toString()} />
          <Kpi label="Limités à une boutique" value={stats.scoped.toString()} />
        </section>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(300px,1fr)_2fr] md:overflow-hidden">
        {/* COLONNE LISTE (1/3) */}
        <aside className="border-r border-border bg-white flex flex-col overflow-hidden min-h-0">
          <div className="p-3 border-b border-border space-y-2 shrink-0">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Rechercher…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void reload()}
              />
              <button className="btn-soft whitespace-nowrap" onClick={() => void reload()}>OK</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {stores.length > 1 && (
                <select className="input h-9 flex-1 min-w-[8rem] text-sm"
                        value={filterStore} onChange={(e) => setFilterStore(e.target.value)}>
                  <option value="">Toutes les boutiques</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <select className="input h-9 flex-1 min-w-[8rem] text-sm"
                      value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                <option value="all">Toutes catégories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-soft">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={onlyTop} onChange={(e) => setOnlyTop(e.target.checked)} /> ★ Top
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Inactifs
              </label>
              <span className="ml-auto tabular-nums">{filtered.length}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="p-4 text-sm text-ink-soft">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-ink-soft/70">
                {products.length === 0 ? 'Aucun produit.' : 'Aucun résultat.'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((p) => {
                  const limited = p.store_ids.length > 0;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => canEdit && setEditing(p)}
                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                          activeId === p.id ? 'bg-accent-soft' : 'hover:bg-gray-50'
                        } ${canEdit ? '' : 'cursor-default'}`}
                      >
                        <div className="flex items-center gap-2">
                          {p.is_top_product && <span className="text-warning" title="Top produit">★</span>}
                          <span className="font-medium text-sm truncate flex-1">{p.name}</span>
                          <span className="text-sm font-medium tabular-nums whitespace-nowrap">
                            {p.price_is_free ? 'libre' : formatEUR(p.sale_price_ttc)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
                          <span className="truncate">{p.category_name ?? 'Sans catégorie'}</span>
                          {!p.is_active && <Badge tone="danger">Inactif</Badge>}
                          {p.is_active && !p.visible_in_pos && <Badge tone="neutral">Caché</Badge>}
                          {limited && (
                            <span className="ml-auto rounded-full bg-bg px-1.5 py-0.5 text-[10px] whitespace-nowrap"
                                  title={p.store_ids.map((id) => storeName.get(id) ?? '?').join(', ')}>
                              🏪 {p.store_ids.length === 1
                                ? (storeName.get(p.store_ids[0]!) ?? '1 boutique')
                                : `${p.store_ids.length} boutiques`}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* COLONNE FICHE (2/3) */}
        <main className="overflow-y-auto bg-bg min-h-0">
          {editing !== undefined ? (
            <ProductFormModal
              key={editing?.id ?? 'new'}
              product={editing}
              taxRates={taxRates}
              categories={categories}
              inline
              onClose={() => setEditing(undefined)}
              onSaved={() => { setEditing(undefined); void reload(); }}
            />
          ) : (
            <div className="h-full grid place-items-center p-8">
              <EmptyState
                icon="◈"
                title="Aucun article sélectionné"
                description="Choisissez un article dans la liste pour voir sa fiche, ou créez-en un nouveau."
                action={canEdit ? (
                  <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau produit</button>
                ) : undefined}
              />
            </div>
          )}
        </main>
      </div>

      {showImport && (
        <ProductImportModal
          onClose={() => setShowImport(false)}
          onCompleted={() => { setShowImport(false); void reload(); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
