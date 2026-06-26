'use client';

import { useEffect, useState } from 'react';
import { generateEan13 } from '@/lib/services/ean';

interface Product {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null;
  sale_price_ttc: number; price_is_free: boolean;
  tax_rate_id: string; category_id: string | null;
  visible_in_pos: boolean; is_active: boolean;
  is_seasonal: boolean; is_customizable: boolean;
  is_top_product?: boolean;
}

export default function ProductFormModal({
  product, taxRates, categories, onClose, onSaved,
}: {
  product: Product | null;
  taxRates: { id: string; code: string; rate: number; label: string; is_default: boolean }[];
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultTax = taxRates.find((t) => t.is_default) ?? taxRates[0];
  const [liveCategories, setLiveCategories] = useState(categories);
  // Recharge la liste des catégories à l'ouverture pour intégrer celles
  // créées depuis la dernière navigation.
  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/categories');
      if (r.ok) setLiveCategories((await r.json()).categories);
    })();
  }, []);
  const [form, setForm] = useState({
    name: product?.name ?? '',
    short_description: product?.short_description ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    sale_price_ttc: product?.sale_price_ttc ?? 0,
    price_is_free: product?.price_is_free ?? false,
    tax_rate_id: product?.tax_rate_id ?? (defaultTax?.id ?? ''),
    category_id: product?.category_id ?? '',
    visible_in_pos: product?.visible_in_pos ?? true,
    is_active: product?.is_active ?? true,
    is_seasonal: product?.is_seasonal ?? false,
    is_customizable: product?.is_customizable ?? false,
    is_top_product: product?.is_top_product ?? false,
    price_change_reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      short_description: form.short_description || null,
      sku: form.sku || null,
      barcode: form.barcode || null,
      sale_price_ttc: Number(form.sale_price_ttc),
      price_is_free: form.price_is_free,
      tax_rate_id: form.tax_rate_id,
      category_id: form.category_id || null,
      visible_in_pos: form.visible_in_pos,
      is_active: form.is_active,
      is_seasonal: form.is_seasonal,
      is_customizable: form.is_customizable,
      is_top_product: form.is_top_product,
    };
    if (product && form.price_change_reason) payload.price_change_reason = form.price_change_reason;
    const res = product
      ? await fetch(`/api/products/${product.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/products', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card max-w-2xl w-full p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{product ? 'Modifier produit' : 'Nouveau produit'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom" full>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description courte" full>
            <input className="input" value={form.short_description}
                   onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
          </Field>
          <Field label="SKU">
            <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </Field>
          <Field label="Code-barres (EAN-13)">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="13 chiffres"
                maxLength={13}
              />
              <button
                type="button"
                className="btn-soft text-xs whitespace-nowrap"
                onClick={() => setForm({ ...form, barcode: generateEan13('20') })}
                title="Génère un EAN-13 valide avec préfixe interne 20"
              >
                Générer EAN
              </button>
            </div>
          </Field>
          <Field label="Catégorie" full>
            <select
              className="input h-11 text-base"
              value={form.category_id ?? ''}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">— Aucune catégorie —</option>
              {liveCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Taux TVA">
            <select
              className="input h-11 text-base"
              value={form.tax_rate_id}
              onChange={(e) => setForm({ ...form, tax_rate_id: e.target.value })}
            >
              {taxRates.map((t) => (
                <option key={t.id} value={t.id}>{t.rate}%</option>
              ))}
            </select>
          </Field>
          <Field label="Prix TTC (€)">
            <input
              type="number" step="0.01" min={0}
              className="input h-11 text-base"
              value={form.sale_price_ttc}
              onChange={(e) => setForm({ ...form, sale_price_ttc: Number(e.target.value) })}
              disabled={form.price_is_free}
            />
          </Field>
          <Field label="Options" full>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mt-2">
              <Check label="Prix libre (bouquet)" checked={form.price_is_free}
                     onChange={(v) => setForm({ ...form, price_is_free: v, sale_price_ttc: v ? 0 : form.sale_price_ttc })} />
              <Check label="Top produit (épinglé en grille)" checked={form.is_top_product}
                     onChange={(v) => setForm({ ...form, is_top_product: v })} />
              <Check label="Visible en caisse" checked={form.visible_in_pos}
                     onChange={(v) => setForm({ ...form, visible_in_pos: v })} />
              <Check label="Saisonnier" checked={form.is_seasonal}
                     onChange={(v) => setForm({ ...form, is_seasonal: v })} />
              <Check label="Actif" checked={form.is_active}
                     onChange={(v) => setForm({ ...form, is_active: v })} />
              <Check label="Personnalisable" checked={form.is_customizable}
                     onChange={(v) => setForm({ ...form, is_customizable: v })} />
            </div>
            {form.is_top_product && (
              <p className="mt-2 text-xs text-ink-soft">
                Les produits Top sont affichés en première ligne de la grille catégories
                (4 maximum). Au-delà, seuls les 4 premiers sont retenus.
              </p>
            )}
          </Field>
          {product && (
            <Field label="Raison du changement de prix" full>
              <input className="input" value={form.price_change_reason}
                     onChange={(e) => setForm({ ...form, price_change_reason: e.target.value })}
                     placeholder="ex : hausse fournisseur, promotion…" />
              <p className="mt-1 text-xs text-ink-soft">
                Tout changement de prix est tracé dans l&apos;historique produit (append-only).
              </p>
            </Field>
          )}
        </div>
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button disabled={saving || !form.name.trim()} onClick={() => void submit()} className="btn-primary">
            {saving ? 'Enregistrement…' : (product ? 'Enregistrer' : 'Créer')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-sm font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
