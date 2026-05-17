'use client';

import { useEffect, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import ProductFormModal from './ProductFormModal';

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

  async function reload() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const res = await fetch(`/api/products?${params.toString()}`);
    if (res.ok) {
      const j = await res.json();
      setProducts(j.products.map((p: Product) => ({
        ...p, sale_price_ttc: Number(p.sale_price_ttc), tax_rate: Number(p.tax_rate),
      })));
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="p-8 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Produits</h1>
        {canEdit && (
          <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau produit</button>
        )}
      </header>

      <div className="flex items-center gap-2">
        <input
          className="input max-w-md"
          placeholder="Rechercher par nom, SKU ou code-barres…"
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void reload(); }}
        />
        <button className="btn-soft" onClick={() => void reload()}>Rechercher</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-soft text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nom</th>
              <th className="text-left px-4 py-3">Catégorie</th>
              <th className="text-left px-4 py-3">SKU</th>
              <th className="text-right px-4 py-3">Prix TTC</th>
              <th className="text-right px-4 py-3">TVA</th>
              <th className="text-center px-4 py-3">Caisse</th>
              <th className="text-center px-4 py-3">Actif</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-soft">Chargement…</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-soft">
                Aucun produit. {canEdit && 'Créez-en un avec le bouton en haut à droite.'}
              </td></tr>
            ) : products.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-bg/60">
                <td className="px-4 py-3 font-medium">
                  {p.name}
                  {p.price_is_free && <span className="ml-2 chip">prix libre</span>}
                  {p.is_customizable && <span className="ml-2 chip">personnalisable</span>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{p.category_name ?? '—'}</td>
                <td className="px-4 py-3 text-ink-soft text-xs font-mono">{p.sku ?? '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatEUR(p.sale_price_ttc)}</td>
                <td className="px-4 py-3 text-right">{p.tax_rate}%</td>
                <td className="px-4 py-3 text-center">{p.visible_in_pos ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-center">{p.is_active ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {canEdit && (
                    <button className="text-sage-deep hover:underline text-sm" onClick={() => setEditing(p)}>
                      Modifier
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
