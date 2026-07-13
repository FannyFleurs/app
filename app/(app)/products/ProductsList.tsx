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
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [onlyTop, setOnlyTop] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
      })));
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showInactive]);

  const filtered = useMemo(() => {
    let arr = products;
    if (filterCat !== 'all') arr = arr.filter((p) => p.category_id === filterCat);
    if (onlyTop) arr = arr.filter((p) => p.is_top_product);
    return arr;
  }, [products, filterCat, onlyTop]);

  // Quand la liste filtrée change, on retire de la sélection les ids absents
  useEffect(() => {
    setSelected((cur) => {
      const visible = new Set(filtered.map((p) => p.id));
      const next = new Set<string>();
      for (const id of cur) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [filtered]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((cur) => {
      if (allSelected) return new Set();
      const next = new Set(cur);
      for (const p of filtered) next.add(p.id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(
      `Supprimer ${selected.size} produit(s) ?\n\n` +
      'Les produits déjà utilisés dans des ventes seront DÉSACTIVÉS (visibles dans "Inclure inactifs"). ' +
      'Les autres seront supprimés définitivement.',
    )) return;
    setBulkBusy(true);
    const r = await fetch('/api/products/bulk-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setBulkBusy(false);
    if (!r.ok) { alert('Erreur lors de la suppression.'); return; }
    const j = await r.json();
    alert(
      `✓ ${j.deleted} supprimé(s) définitivement\n` +
      `✓ ${j.deactivated} désactivé(s) (utilisés dans des ventes)\n` +
      (j.failure_count > 0 ? `✗ ${j.failure_count} échec(s)` : ''),
    );
    setSelected(new Set());
    void reload();
  }

  const stats = useMemo(() => ({
    total: products.length,
    inPos: products.filter((p) => p.visible_in_pos).length,
    customizable: products.filter((p) => p.is_customizable).length,
    seasonal: products.filter((p) => p.is_seasonal).length,
  }), [products]);

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Produits"
        subtitle="Catalogue complet : bouquets, plantes, cache-pots, bougies, services, cartes cadeaux."
        actions={canEdit ? (
          <div className="flex gap-2">
            <button className="btn-soft" onClick={() => setShowImport(true)}>
              ⬆ Importer
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau produit</button>
          </div>
        ) : null}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Références" value={stats.total.toString()} />
        <Kpi label="Visibles en caisse" value={stats.inPos.toString()} />
        <Kpi label="Personnalisables" value={stats.customizable.toString()} />
        <Kpi label="Saisonniers" value={stats.seasonal.toString()} />
      </section>

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-md"
          placeholder="Rechercher par nom, SKU, code-barres…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void reload()}
        />
        <button className="btn-soft" onClick={() => void reload()}>Rechercher</button>
        <label className="ml-2 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Inclure inactifs
        </label>
        <div className="ml-auto flex gap-1 flex-wrap">
          <FilterChip active={onlyTop} onClick={() => setOnlyTop((v) => !v)}>
            ★ TOP
          </FilterChip>
          <FilterChip active={filterCat === 'all' && !onlyTop} onClick={() => { setFilterCat('all'); setOnlyTop(false); }}>
            Toutes
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c.id} active={filterCat === c.id} onClick={() => setFilterCat(c.id)}>
              {c.name}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Barre d'actions de masse — visible uniquement si au moins une coche */}
      {selected.size > 0 && (
        <div className="card p-3 flex items-center gap-3 bg-accent-soft border-accent-deep/30">
          <div className="text-sm font-medium">
            {selected.size} produit(s) sélectionné(s)
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-ink-soft hover:text-ink"
          >
            Tout désélectionner
          </button>
          <div className="flex-1" />
          {canEdit && (
            <button
              onClick={() => void bulkDelete()}
              disabled={bulkBusy}
              className="btn-soft text-sm text-danger hover:bg-danger/10"
            >
              {bulkBusy ? 'Suppression…' : `Supprimer (${selected.size})`}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="◈"
          title={products.length === 0 ? 'Aucun produit' : 'Aucun résultat'}
          description={products.length === 0
            ? 'Commencez par ajouter vos bouquets, plantes ou services.'
            : 'Aucun produit ne correspond à votre recherche.'}
          action={canEdit && products.length === 0 && (
            <button className="btn-primary" onClick={() => setEditing(null)}>+ Créer le premier produit</button>
          )}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-ink-soft text-xs uppercase">
              <tr>
                {canEdit && (
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      title={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                      className="cursor-pointer"
                    />
                  </th>
                )}
                <th className="text-center px-2 py-3 w-8" title="Top produit">★</th>
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3">Catégorie</th>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-right px-4 py-3">Prix TTC</th>
                <th className="text-right px-4 py-3">TVA</th>
                <th className="text-center px-4 py-3">État</th>
                {canEdit && <th className="text-right px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isSelected = selected.has(p.id);
                return (
                  <tr
                    key={p.id}
                    onClick={() => canEdit && setEditing(p)}
                    className={`border-t border-border hover:bg-bg/60 ${canEdit ? 'cursor-pointer' : ''} ${isSelected ? 'bg-accent-soft/40' : ''}`}
                  >
                    {canEdit && (
                      <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                          className="cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-2 py-3 text-center text-base">
                      {p.is_top_product ? (
                        <span className="text-warning" title="Top produit">★</span>
                      ) : (
                        <span className="text-ink-soft/30">·</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.price_is_free && <Badge tone="warning">Prix libre</Badge>}
                        {p.is_customizable && <Badge tone="soft">Personnalisable</Badge>}
                        {p.is_seasonal && <Badge tone="neutral">Saisonnier</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{p.category_name ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-soft text-xs font-mono">{p.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {p.price_is_free ? <span className="text-ink-soft">libre</span> : formatEUR(p.sale_price_ttc)}
                    </td>
                    <td className="px-4 py-3 text-right">{p.tax_rate}%</td>
                    <td className="px-4 py-3 text-center">
                      {!p.is_active ? <Badge tone="danger">Inactif</Badge> :
                       p.visible_in_pos ? <Badge tone="success">Caisse</Badge> :
                       <Badge tone="neutral">Caché</Badge>}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <span className="text-sage-deep text-sm">Modifier ›</span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <ProductFormModal
          product={editing}
          taxRates={taxRates}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
        />
      )}

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
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
        active ? 'bg-sage text-white border-sage' : 'bg-white text-ink border-border hover:border-sage/40'
      }`}
    >
      {children}
    </button>
  );
}
