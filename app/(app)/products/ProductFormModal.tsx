'use client';

import { useEffect, useState } from 'react';
import { generateEan13 } from '@/lib/services/ean';

interface Product {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null;
  sale_price_ttc: number; price_is_free: boolean;
  purchase_price_ht?: number | null;
  tax_rate_id: string; category_id: string | null;
  visible_in_pos: boolean; is_active: boolean;
  is_seasonal: boolean; is_customizable: boolean;
  is_top_product?: boolean;
  no_discount?: boolean;
  color?: string | null;
  store_ids?: string[];
}

// Palette de couleurs pré-définies pour les tuiles caisse — cohérente
// avec celle utilisée pour les catégories.
const PRODUCT_COLORS = [
  { value: null,      label: 'Aucune' },
  { value: '#F4D7D7', label: 'Rose pâle' },
  { value: '#F8E0CC', label: 'Pêche' },
  { value: '#F6E6B8', label: 'Crème' },
  { value: '#D9E7C1', label: 'Vert clair' },
  { value: '#C7E5DD', label: 'Menthe' },
  { value: '#C6D8E8', label: 'Bleu ciel' },
  { value: '#DCD2E6', label: 'Lavande' },
  { value: '#F0CFD5', label: 'Vieux rose' },
  { value: '#E8E0D0', label: 'Beige' },
  { value: '#D6D6D6', label: 'Gris clair' },
];

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
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  // Recharge la liste des catégories + boutiques à l'ouverture.
  useEffect(() => {
    void (async () => {
      const [rC, rS] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/me'),
      ]);
      if (rC.ok) setLiveCategories((await rC.json()).categories);
      if (rS.ok) setStores((await rS.json()).stores ?? []);
    })();
  }, []);
  const [form, setForm] = useState({
    name: product?.name ?? '',
    short_description: product?.short_description ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    sale_price_ttc: product?.sale_price_ttc ?? 0,
    purchase_price_ht: product?.purchase_price_ht ?? 0,
    price_is_free: product?.price_is_free ?? false,
    tax_rate_id: product?.tax_rate_id ?? (defaultTax?.id ?? ''),
    category_id: product?.category_id ?? '',
    visible_in_pos: product?.visible_in_pos ?? true,
    is_active: product?.is_active ?? true,
    is_seasonal: product?.is_seasonal ?? false,
    is_customizable: product?.is_customizable ?? false,
    is_top_product: product?.is_top_product ?? false,
    no_discount: product?.no_discount ?? false,
    color: product?.color ?? null,
    store_ids: product?.store_ids ?? [],
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
      purchase_price_ht: form.purchase_price_ht > 0 ? Number(form.purchase_price_ht) : null,
      price_is_free: form.price_is_free,
      tax_rate_id: form.tax_rate_id,
      category_id: form.category_id || null,
      visible_in_pos: form.visible_in_pos,
      is_active: form.is_active,
      is_seasonal: form.is_seasonal,
      is_customizable: form.is_customizable,
      is_top_product: form.is_top_product,
      no_discount: form.no_discount,
      color: form.color,
      store_ids: form.store_ids,
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
          <Field label="Prix d'achat HT (€)">
            <input
              type="number" step="0.01" min={0}
              className="input h-11 text-base"
              value={form.purchase_price_ht}
              onChange={(e) => setForm({ ...form, purchase_price_ht: Number(e.target.value) })}
              placeholder="0.00"
            />
          </Field>
          <Field label="Marge calculée" full>
            {(() => {
              const purchase = Number(form.purchase_price_ht);
              const sellTtc = Number(form.sale_price_ttc);
              const taxRate = taxRates.find((t) => t.id === form.tax_rate_id)?.rate ?? 0;
              const sellHt = sellTtc / (1 + taxRate / 100);
              if (purchase <= 0 || sellHt <= 0) {
                return <div className="text-sm text-ink-soft italic">
                  Renseignez prix d&apos;achat HT + prix de vente TTC pour voir la marge.
                </div>;
              }
              const margin = sellHt - purchase;
              const marginPct = (margin / sellHt) * 100;
              const coeff = sellHt / purchase;
              return (
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Marge brute" value={`${margin.toFixed(2)} €`} tone={margin > 0 ? 'success' : 'danger'} />
                  <Stat label="Taux de marge" value={`${marginPct.toFixed(1)} %`} tone={marginPct >= 50 ? 'success' : marginPct >= 30 ? 'warning' : 'danger'} />
                  <Stat label="Coefficient" value={`× ${coeff.toFixed(2)}`} />
                </div>
              );
            })()}
          </Field>
          <Field label="Options" full>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mt-2">
              <Check label="Prix libre (bouquet)" checked={form.price_is_free}
                     onChange={(v) => setForm({ ...form, price_is_free: v, sale_price_ttc: v ? 0 : form.sale_price_ttc })} />
              <Check label="Top produit (épinglé en grille)" checked={form.is_top_product}
                     onChange={(v) => setForm({ ...form, is_top_product: v })} />
              <Check label="Prix fort (aucune remise applicable)" checked={form.no_discount}
                     onChange={(v) => setForm({ ...form, no_discount: v })} />
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

          <Field label="Couleur de la tuile (caisse)" full>
            <div className="flex flex-wrap gap-2 mt-1">
              {PRODUCT_COLORS.map((c) => {
                const isSelected = form.color === c.value;
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setForm({ ...form, color: c.value })}
                    title={c.label}
                    className={`h-9 w-9 rounded-lg border transition-all ${
                      isSelected ? 'ring-2 shadow-sm' : 'hover:scale-105'
                    } ${c.value === null ? 'border-dashed border-border bg-white' : 'border-border'}`}
                    style={{
                      backgroundColor: c.value ?? '#fff',
                      ...(isSelected ? { ['--tw-ring-color' as string]: 'var(--primary)' } : {}),
                    }}
                  >
                    {c.value === null && (
                      <span className="text-xs text-ink-soft">—</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Couleur de fond appliquée à la tuile article sur la grille caisse.
            </p>
          </Field>

          {stores.length > 1 && (
            <Field label="Boutiques concernées" full>
              <div className="mt-1 space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.store_ids.length === 0}
                    onChange={(e) => {
                      if (e.target.checked) setForm({ ...form, store_ids: [] });
                    }}
                  />
                  <span className="font-medium">Toutes les boutiques</span>
                </label>
                {form.store_ids.length > 0 && (
                  <div className="ml-6 space-y-1 border-l border-border pl-3">
                    {stores.map((s) => {
                      const checked = form.store_ids.includes(s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...form.store_ids, s.id]
                                : form.store_ids.filter((x) => x !== s.id);
                              setForm({ ...form, store_ids: next });
                            }}
                          />
                          {s.name}
                        </label>
                      );
                    })}
                  </div>
                )}
                {form.store_ids.length === 0 && stores.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, store_ids: [stores[0]!.id] })}
                    className="ml-6 text-xs text-accent-deep hover:underline"
                  >
                    ↳ Limiter à certaines boutiques
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                Si aucune boutique n&apos;est cochée, le produit est visible dans toutes les boutiques de l&apos;organisation.
              </p>
            </Field>
          )}

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
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'danger' }) {
  const cls = tone === 'success' ? 'text-success'
    : tone === 'warning' ? 'text-warning'
    : tone === 'danger' ? 'text-danger'
    : 'text-ink';
  return (
    <div className="rounded-xl border border-border bg-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
