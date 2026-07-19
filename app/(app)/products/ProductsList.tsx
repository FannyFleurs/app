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
  canEdit, taxRates, categories, backOffice = false,
}: {
  canEdit: boolean;
  taxRates: { id: string; code: string; rate: number; label: string; is_default: boolean }[];
  categories: { id: string; name: string }[];
  backOffice?: boolean;
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
  // Sélection multiple (back-office) : attribuer une boutique en masse.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStores, setBulkStores] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
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

  function toggleSelect(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applyBulkStore() {
    if (selectedIds.size === 0) return;
    if (bulkStores.length === 0
        && !confirm('Aucune boutique sélectionnée : les articles seront visibles dans TOUTES les boutiques. Continuer ?')) {
      return;
    }
    setBulkBusy(true); setBulkMsg(null);
    const r = await fetch('/api/products/bulk-store', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: Array.from(selectedIds), store_ids: bulkStores }),
    });
    setBulkBusy(false);
    if (r.ok) {
      const j = await r.json();
      setBulkMsg(`${j.updated} article(s) mis à jour.`);
      setSelectedIds(new Set());
      await reload();
    } else {
      setBulkMsg('Échec de l’attribution.');
    }
  }

  // Nombre d'articles « toutes boutiques » (non rattachés) : ils
  // n'apparaissent plus sur aucune caisse tant qu'ils ne sont pas rangés.
  const unassignedCount = useMemo(
    () => products.filter((p) => p.store_ids.length === 0).length,
    [products],
  );
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  async function assignAllUnassigned() {
    if (!assignTarget) return;
    const name = storeName.get(assignTarget) ?? 'cette boutique';
    if (!confirm(`Ranger les ${unassignedCount} article(s) « toutes boutiques » sous « ${name} » ? `
      + `Ils n'apparaîtront alors QUE sur la caisse de cette boutique.`)) return;
    setAssignBusy(true); setAssignMsg(null);
    const r = await fetch('/api/products/assign-unassigned', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_ids: [assignTarget] }),
    });
    setAssignBusy(false);
    if (r.ok) {
      const j = await r.json();
      setAssignMsg(`${j.updated} article(s) rangé(s) sous « ${name} ».`);
      await reload();
    } else {
      setAssignMsg('Échec de l’opération.');
    }
  }

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

  const activeId = editing && 'id' in editing ? editing.id : null;

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Produits"
          subtitle="Bouquets, plantes, cache-pots, bougies, services, cartes cadeaux."
          actions={canEdit ? (
            <div className="flex gap-2">
              <button className="btn-soft" onClick={() => setShowImport(true)}>⬆ Importer</button>
              <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau produit</button>
            </div>
          ) : null}
        />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_3fr] md:overflow-hidden">
        {/* COLONNE LISTE (1/3).
            Mobile : master-detail — on masque la liste quand une fiche est
            ouverte (editing !== undefined) ; sur md+ les deux colonnes
            cohabitent. Les contraintes de hauteur/scroll ne s'appliquent qu'à
            partir de md (sur mobile la liste s'écoule naturellement). */}
        <aside className={`border-r border-border bg-white flex-col min-h-0 md:flex md:overflow-hidden ${
          editing !== undefined ? 'hidden md:flex' : 'flex'
        }`}>
          <div className="px-4 md:px-3 py-3 border-b border-border space-y-2 shrink-0">
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
              {/* Filtre boutique : réservé au back-office (gestion multi-boutiques).
                  Dans l'app, chaque boutique ne voit que ses propres articles. */}
              {backOffice && stores.length > 1 && (
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
              {canEdit && backOffice && stores.length > 1 && (
                <button
                  className={`rounded px-1.5 py-0.5 ${selectMode ? 'bg-accent-deep text-white' : 'hover:bg-gray-100'}`}
                  onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); setBulkMsg(null); }}
                >
                  {selectMode ? 'Terminer' : '☑ Sélection'}
                </button>
              )}
              <span className="ml-auto tabular-nums">{filtered.length}</span>
            </div>
            {/* Articles « toutes boutiques » : sur une organisation multi-
                boutiques ils n'apparaissent plus sur les caisses tant qu'ils ne
                sont pas rattachés. Rangement en 1 clic. */}
            {canEdit && backOffice && stores.length > 1 && unassignedCount > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 space-y-2">
                <p className="text-xs text-amber-800">
                  <strong>{unassignedCount}</strong> article(s) « toutes boutiques » ne sont
                  rattachés à aucune boutique : ils n’apparaissent sur <strong>aucune caisse</strong>.
                  Rangez-les sous une boutique :
                </p>
                <div className="flex gap-2">
                  <select className="input h-9 flex-1 text-sm"
                          value={assignTarget} onChange={(e) => setAssignTarget(e.target.value)}>
                    <option value="">Choisir une boutique…</option>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button className="btn-primary h-9 px-3 text-sm whitespace-nowrap"
                          disabled={assignBusy || !assignTarget}
                          onClick={() => void assignAllUnassigned()}>
                    {assignBusy ? '…' : 'Ranger ici'}
                  </button>
                </div>
                {assignMsg && <p className="text-xs text-success">{assignMsg}</p>}
              </div>
            )}
            {selectMode && (
              <div className="rounded-xl border border-border bg-bg/60 p-2 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{selectedIds.size} sélectionné(s)</span>
                  <div className="flex gap-2">
                    <button className="text-accent-deep hover:underline"
                            onClick={() => setSelectedIds(new Set(filtered.map((p) => p.id)))}>
                      Tout ({filtered.length})
                    </button>
                    <button className="text-ink-soft hover:underline" onClick={() => setSelectedIds(new Set())}>
                      Aucun
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-ink-soft">Attribuer à :</span>
                    {stores.map((s) => {
                      const on = bulkStores.includes(s.id);
                      return (
                        <button key={s.id} type="button"
                                onClick={() => setBulkStores((cur) => cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id])}
                                className={`px-2 py-0.5 rounded-lg border text-xs font-medium ${
                                  on ? 'border-accent-deep bg-accent-soft/40 text-accent-deep' : 'border-border text-ink-soft hover:bg-gray-50'
                                }`}>
                          {on ? '✓ ' : ''}{s.name}
                        </button>
                      );
                    })}
                    {bulkStores.length === 0 && <span className="text-xs text-ink-soft">(toutes les boutiques)</span>}
                  </div>
                  <button className="btn-primary h-9 px-3 text-sm w-full"
                          disabled={bulkBusy || selectedIds.size === 0}
                          onClick={() => void applyBulkStore()}>
                    {bulkBusy ? '…' : `Appliquer à ${selectedIds.size} article(s)`}
                  </button>
                </div>
                {bulkMsg && <p className="text-xs text-success">{bulkMsg}</p>}
              </div>
            )}
          </div>

          <div className="md:flex-1 md:overflow-y-auto md:min-h-0">
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
                        onClick={() => (selectMode ? toggleSelect(p.id) : canEdit && setEditing(p))}
                        className={`w-full text-left px-4 md:px-3 py-2.5 transition-colors ${
                          selectMode && selectedIds.has(p.id) ? 'bg-accent-soft'
                          : activeId === p.id ? 'bg-accent-soft' : 'hover:bg-gray-50'
                        } ${canEdit ? '' : 'cursor-default'}`}
                      >
                        <div className="flex items-center gap-2">
                          {selectMode && (
                            <span className={`h-4 w-4 shrink-0 rounded border grid place-items-center text-[10px] ${
                              selectedIds.has(p.id) ? 'bg-accent-deep border-accent-deep text-white' : 'border-border'
                            }`}>{selectedIds.has(p.id) ? '✓' : ''}</span>
                          )}
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

        {/* COLONNE FICHE (2/3). Mobile : plein écran quand une fiche est
            ouverte, masquée sinon (c'est la liste qui s'affiche). */}
        <main className={`bg-bg min-h-0 md:block md:overflow-y-auto ${
          editing === undefined ? 'hidden md:block' : 'block'
        }`}>
          {editing !== undefined ? (
            <>
              {/* Barre retour (mobile uniquement) */}
              <button
                className="md:hidden w-full flex items-center gap-2 px-4 py-3 border-b border-border bg-white text-sm font-medium"
                onClick={() => setEditing(undefined)}
              >
                <span aria-hidden>←</span> Retour à la liste
              </button>
              <ProductFormModal
                key={editing?.id ?? 'new'}
                product={editing}
                taxRates={taxRates}
                categories={categories}
                inline
                backOffice={backOffice}
                onClose={() => setEditing(undefined)}
                onSaved={() => { setEditing(undefined); void reload(); }}
              />
            </>
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
          stores={stores}
          backOffice={backOffice}
          onClose={() => setShowImport(false)}
          onCompleted={() => { setShowImport(false); void reload(); }}
        />
      )}
    </div>
  );
}
