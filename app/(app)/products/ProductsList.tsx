'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import ProductFormModal from './ProductFormModal';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface Product {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null;
  sale_price_ttc: number; price_is_free: boolean;
  tax_rate: number; tax_rate_id: string; tax_rate_code: string;
  category_id: string | null; category_name: string | null;
  visible_in_pos: boolean; is_active: boolean;
  is_seasonal: boolean; is_customizable: boolean; tags: string[];
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
    if (filterCat === 'all') return products;
    return products.filter((p) => p.category_id === filterCat);
  }, [products, filterCat]);

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
          <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau produit</button>
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
          <FilterChip active={filterCat === 'all'} onClick={() => setFilterCat('all')}>Toutes</FilterChip>
          {categories.map((c) => (
            <FilterChip key={c.id} active={filterCat === c.id} onClick={() => setFilterCat(c.id)}>
              {c.name}
            </FilterChip>
          ))}
        </div>
      </div>

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
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => canEdit && setEditing(p)}
                  className={`border-t border-border hover:bg-bg/60 ${canEdit ? 'cursor-pointer' : ''}`}
                >
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
              ))}
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
