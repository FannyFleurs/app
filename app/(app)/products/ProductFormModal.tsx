'use client';

import { useEffect, useState } from 'react';
import { generateEan13 } from '@/lib/services/ean';
import { getOrCreateDeviceId } from '@/lib/device';
import ProductHistory from './ProductHistory';
import LabelPrintModal from './LabelPrintModal';

interface Product {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null;
  sale_price_ttc: number; price_is_free: boolean;
  purchase_price_ht?: number | null;
  transport_cost_ht?: number | null;
  tax_rate_id: string; category_id: string | null;
  supplier_id?: string | null;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
  visible_in_pos: boolean; is_active: boolean;
  is_seasonal: boolean; is_customizable: boolean;
  is_top_product?: boolean;
  no_discount?: boolean;
  color?: string | null;
  store_ids?: string[];
}

// Palette de couleurs pré-définies pour les tuiles caisse — cohérente
// avec celle utilisée pour les catégories.
// Parse un montant saisi à la française (virgule ou point décimal).
function parseAmount(s: string): number {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

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
  product, taxRates, categories, onClose, onSaved, inline = false, backOffice = false,
  prefillBarcode, posteStoreOverride,
}: {
  product: Product | null;
  taxRates: { id: string; code: string; rate: number; label: string; is_default: boolean }[];
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  /** true = panneau intégré (page Produits), false = modale superposée. */
  inline?: boolean;
  /** true = back-office : sélection multi-boutiques. Sinon l'article est
   *  rattaché automatiquement à la boutique de l'utilisateur. */
  backOffice?: boolean;
  /** Code-barres pré-rempli (ex : scan PDA d'un article inconnu). */
  prefillBarcode?: string;
  /** Boutique du poste forcée (PDA : l'appareil n'est pas une caisse). */
  posteStoreOverride?: string | null;
}) {
  const defaultTax = taxRates.find((t) => t.is_default) ?? taxRates[0];
  const [liveCategories, setLiveCategories] = useState(categories);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  // Boutique du POSTE (caisse liée à cet appareil) : sert à scoper un nouvel
  // article à la boutique où il est créé, même pour un owner/admin — sinon il
  // serait « toutes boutiques » et apparaîtrait sur toutes les caisses.
  const [posteStoreId, setPosteStoreId] = useState<string | null>(posteStoreOverride ?? null);
  // Recharge la liste des catégories + fournisseurs + boutiques à l'ouverture.
  async function refetchCategories() {
    const r = await fetch('/api/categories');
    if (r.ok) setLiveCategories((await r.json()).categories);
  }
  async function refetchSuppliers() {
    const r = await fetch('/api/suppliers');
    if (r.ok) setSuppliers((await r.json()).suppliers);
  }
  useEffect(() => {
    void (async () => {
      const [rC, rSup, rS] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/suppliers'),
        fetch('/api/me'),
      ]);
      if (rC.ok) setLiveCategories((await rC.json()).categories);
      if (rSup.ok) setSuppliers((await rSup.json()).suppliers);
      if (rS.ok) setStores((await rS.json()).stores ?? []);
    })();
  }, []);
  // Hors back-office : détecte la boutique du poste (caisse liée à l'appareil).
  // Si une boutique est imposée (PDA), on l'utilise directement.
  useEffect(() => {
    if (backOffice || posteStoreOverride) return;
    void (async () => {
      try {
        const id = getOrCreateDeviceId();
        const r = await fetch(`/api/registers/mine?device_id=${encodeURIComponent(id)}`);
        if (r.ok) {
          const reg = (await r.json()).register as { store_id?: string } | null;
          if (reg?.store_id) setPosteStoreId(reg.store_id);
        }
      } catch { /* pas de poste lié : comportement par défaut */ }
    })();
  }, [backOffice]);
  const [form, setForm] = useState({
    name: product?.name ?? '',
    short_description: product?.short_description ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? prefillBarcode ?? '',
    sale_price_ttc: product?.sale_price_ttc != null ? String(product.sale_price_ttc) : '',
    purchase_price_ht: product?.purchase_price_ht != null ? String(product.purchase_price_ht) : '',
    transport_cost_ht: product?.transport_cost_ht != null ? String(product.transport_cost_ht) : '',
    price_is_free: product?.price_is_free ?? false,
    tax_rate_id: product?.tax_rate_id ?? (defaultTax?.id ?? ''),
    category_id: product?.category_id ?? '',
    supplier_id: product?.supplier_id ?? '',
    discount_type: (product?.discount_type ?? '') as '' | 'percent' | 'amount',
    discount_value: product?.discount_value != null ? String(product.discount_value) : '',
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
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [showLabel, setShowLabel] = useState(false);

  // Création rapide en ligne (catégorie / fournisseur inexistant).
  const [newCat, setNewCat] = useState<string | null>(null);   // null = fermé
  const [newSup, setNewSup] = useState<string | null>(null);
  const [inlineBusy, setInlineBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!product) return;
    if (!confirm(
      `Supprimer l'article « ${product.name} » ?\n\n`
      + "S'il a déjà été vendu, il sera archivé (retiré des listes) pour préserver "
      + "l'historique. Sinon, il sera supprimé définitivement.",
    )) return;
    setDeleting(true); setError(null);
    const r = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (r.ok) { onSaved(); onClose(); }
    else { setError('Suppression impossible.'); }
  }

  async function addCategory() {
    const name = (newCat ?? '').trim();
    if (!name) return;
    setInlineBusy(true);
    try {
      const r = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, position: 0, visible_in_pos: true }),
      });
      if (r.ok) {
        const { id } = await r.json();
        await refetchCategories();
        setForm((f) => ({ ...f, category_id: id }));
        setNewCat(null);
      } else {
        const j = await r.json().catch(() => ({}));
        setError(j.message ?? 'Création catégorie impossible');
      }
    } finally { setInlineBusy(false); }
  }

  async function addSupplier() {
    const name = (newSup ?? '').trim();
    if (!name) return;
    setInlineBusy(true);
    try {
      const r = await fetch('/api/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (r.ok) {
        const { id } = await r.json();
        await refetchSuppliers();
        setForm((f) => ({ ...f, supplier_id: id }));
        setNewSup(null);
      } else {
        const j = await r.json().catch(() => ({}));
        setError(j.message ?? 'Création fournisseur impossible');
      }
    } finally { setInlineBusy(false); }
  }

  async function submit() {
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      short_description: form.short_description || null,
      sku: form.sku || null,
      barcode: form.barcode || null,
      sale_price_ttc: parseAmount(form.sale_price_ttc),
      purchase_price_ht: parseAmount(form.purchase_price_ht) > 0 ? parseAmount(form.purchase_price_ht) : null,
      transport_cost_ht: form.transport_cost_ht.trim() ? parseAmount(form.transport_cost_ht) : null,
      price_is_free: form.price_is_free,
      tax_rate_id: form.tax_rate_id,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      discount_type: form.discount_type || null,
      discount_value: form.discount_type ? parseAmount(form.discount_value) : null,
      visible_in_pos: form.visible_in_pos,
      is_active: form.is_active,
      is_seasonal: form.is_seasonal,
      is_customizable: form.is_customizable,
      is_top_product: form.is_top_product,
      no_discount: form.no_discount,
      color: form.color,
    };
    // Boutiques :
    //  - back-office : sélection multi-boutiques explicite. « Toutes les
    //    boutiques » (aucune cochée) est traduit en la liste EXPLICITE de
    //    toutes les boutiques : sur la caisse le filtre est strict (un article
    //    sans boutique n'apparaît sur AUCUNE caisse), donc « toutes » doit
    //    réellement rattacher chaque boutique ;
    //  - app, NOUVEL article sur un poste lié : on le scope à la boutique du
    //    poste ;
    //  - app, modification : on ne touche pas au périmètre existant.
    if (backOffice) {
      payload.store_ids = form.store_ids.length > 0 ? form.store_ids : stores.map((s) => s.id);
    } else if (!product && posteStoreId) {
      payload.store_ids = [posteStoreId];
    }
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
    <div className={inline
      ? 'p-4 sm:p-6'
      : 'fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-2 sm:p-4 overflow-auto'}>
      <div className={inline
        ? 'card w-full p-4 sm:p-6'
        : 'card w-full max-w-2xl lg:max-w-4xl p-4 sm:p-6 my-4 sm:my-8'}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{product ? 'Modifier produit' : 'Nouveau produit'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none"
                  title={inline ? 'Fermer la fiche' : 'Fermer'}>✕</button>
        </div>

        {/* Onglets Détails / Historique (l'historique n'existe que pour un
            produit déjà créé). */}
        {product && (
          <div className="mb-4 flex gap-1 border-b border-border">
            {(['details', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-[color:var(--primary)] text-ink'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {t === 'details' ? 'Détails' : 'Historique'}
              </button>
            ))}
          </div>
        )}

        {tab === 'history' && product ? (
          <ProductHistory productId={product.id} />
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <Field label="Catégorie">
            {newCat === null ? (
              <div className="flex gap-2">
                <select
                  className="input h-11 text-base flex-1"
                  value={form.category_id ?? ''}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">— Aucune catégorie —</option>
                  {liveCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn-soft whitespace-nowrap"
                        onClick={() => setNewCat('')} title="Créer une catégorie">+ Créer</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input className="input h-11 flex-1" autoFocus value={newCat}
                       placeholder="Nom de la catégorie"
                       onChange={(e) => setNewCat(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addCategory(); } }} />
                <button type="button" className="btn-primary whitespace-nowrap"
                        disabled={inlineBusy || !newCat.trim()} onClick={() => void addCategory()}>Ajouter</button>
                <button type="button" className="btn-ghost" onClick={() => setNewCat(null)}>✕</button>
              </div>
            )}
          </Field>
          <Field label="Fournisseur">
            {newSup === null ? (
              <div className="flex gap-2">
                <select
                  className="input h-11 text-base flex-1"
                  value={form.supplier_id ?? ''}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                >
                  <option value="">— Aucun fournisseur —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" className="btn-soft whitespace-nowrap"
                        onClick={() => setNewSup('')} title="Créer un fournisseur">+ Créer</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input className="input h-11 flex-1" autoFocus value={newSup}
                       placeholder="Nom du fournisseur"
                       onChange={(e) => setNewSup(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addSupplier(); } }} />
                <button type="button" className="btn-primary whitespace-nowrap"
                        disabled={inlineBusy || !newSup.trim()} onClick={() => void addSupplier()}>Ajouter</button>
                <button type="button" className="btn-ghost" onClick={() => setNewSup(null)}>✕</button>
              </div>
            )}
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
              type="text" inputMode="decimal"
              className="input h-11 text-base"
              value={form.sale_price_ttc}
              onChange={(e) => setForm({ ...form, sale_price_ttc: e.target.value.replace(/[^0-9.,]/g, '') })}
              disabled={form.price_is_free}
              placeholder="0,00"
            />
          </Field>
          <Field label="Prix d'achat HT (€)">
            <input
              type="text" inputMode="decimal"
              className="input h-11 text-base"
              value={form.purchase_price_ht}
              onChange={(e) => setForm({ ...form, purchase_price_ht: e.target.value.replace(/[^0-9.,]/g, '') })}
              placeholder="0,00"
            />
          </Field>
          <Field label="Coût transport HT (€)">
            <input
              type="text" inputMode="decimal"
              className="input h-11 text-base"
              value={form.transport_cost_ht}
              onChange={(e) => setForm({ ...form, transport_cost_ht: e.target.value.replace(/[^0-9.,]/g, '') })}
              placeholder="hérité de la catégorie"
            />
            <p className="mt-1 text-xs text-ink-soft">Vide = coût par défaut de la catégorie (Réglages → Coûts de transport).</p>
          </Field>
          <Field label="Remise (affichée sur l'étiquette)" full>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input h-11 w-auto"
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value as '' | 'percent' | 'amount' })}
              >
                <option value="">Aucune remise</option>
                <option value="percent">Pourcentage (%)</option>
                <option value="amount">Montant (€)</option>
              </select>
              {form.discount_type && (
                <input
                  type="text" inputMode="decimal"
                  className="input h-11 w-28"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value.replace(/[^0-9.,]/g, '') })}
                  placeholder={form.discount_type === 'percent' ? 'ex : 20' : 'ex : 5,00'}
                />
              )}
              {form.discount_type && parseAmount(form.discount_value) > 0 && (() => {
                const price = parseAmount(form.sale_price_ttc);
                const raw = form.discount_type === 'percent'
                  ? price * (1 - parseAmount(form.discount_value) / 100)
                  : price - parseAmount(form.discount_value);
                const disc = Math.max(0, raw);
                return (
                  <span className="text-sm">
                    <span className="text-ink-soft line-through mr-1">{price.toFixed(2)} €</span>
                    <span className="font-semibold text-success">{disc.toFixed(2)} €</span>
                  </span>
                );
              })()}
            </div>
          </Field>
          <Field label="Marge calculée" full>
            {(() => {
              const purchase = parseAmount(form.purchase_price_ht);
              const transport = parseAmount(form.transport_cost_ht);
              const sellTtc = parseAmount(form.sale_price_ttc);
              const taxRate = taxRates.find((t) => t.id === form.tax_rate_id)?.rate ?? 0;
              const sellHt = sellTtc / (1 + taxRate / 100);
              if (purchase <= 0 || sellHt <= 0) {
                return <div className="text-sm text-ink-soft italic">
                  Renseignez prix d&apos;achat HT + prix de vente TTC pour voir la marge.
                </div>;
              }
              const cost = purchase + transport;
              const margin = sellHt - cost;
              const marginPct = (margin / sellHt) * 100;
              const coeff = sellHt / cost;
              return (
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
                     onChange={(v) => setForm({ ...form, price_is_free: v, sale_price_ttc: v ? '' : form.sale_price_ttc })} />
              <Check label="Top produit (épinglé en grille)" checked={form.is_top_product}
                     onChange={(v) => setForm({ ...form, is_top_product: v })} />
              <Check label="Visible en caisse" checked={form.visible_in_pos}
                     onChange={(v) => setForm({ ...form, visible_in_pos: v })} />
              <Check label="Actif" checked={form.is_active}
                     onChange={(v) => setForm({ ...form, is_active: v })} />
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

          {backOffice && stores.length > 0 && (
            <Field label="Boutiques concernées" full>
              <div className="mt-1 space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.store_ids.length === 0 || stores.every((s) => form.store_ids.includes(s.id))}
                    onChange={(e) => {
                      if (e.target.checked) setForm({ ...form, store_ids: [] });
                    }}
                  />
                  <span className="font-medium">Toutes les boutiques</span>
                </label>
                {form.store_ids.length > 0 && !stores.every((s) => form.store_ids.includes(s.id)) && (
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
                {(form.store_ids.length === 0 || stores.every((s) => form.store_ids.includes(s.id))) && stores.length > 1 && (
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
                « Toutes les boutiques » = l&apos;article est vendu sur <strong>chaque</strong> caisse.
                Pour le limiter, cochez « Limiter à certaines boutiques » puis sélectionnez-les.
                Un article apparaît uniquement sur la caisse des boutiques cochées.
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
        )}
        {error && tab === 'details' && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {tab === 'details' ? (
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowLabel(true)}
                      className="btn-soft" title="Imprimer une étiquette avec code-barres et prix">
                🏷️ Imprimer étiquette
              </button>
              {product && (
                <button type="button" onClick={() => void remove()} disabled={deleting}
                        className="btn-soft text-danger" title="Supprimer cet article">
                  {deleting ? 'Suppression…' : '🗑 Supprimer'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost">Annuler</button>
              <button disabled={saving || !form.name.trim()} onClick={() => void submit()} className="btn-primary">
                {saving ? 'Enregistrement…' : (product ? 'Enregistrer' : 'Créer')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="btn-ghost">Fermer</button>
          </div>
        )}
      </div>

      {showLabel && (
        <LabelPrintModal
          product={{
            name: form.name,
            barcode: form.barcode || null,
            sale_price_ttc: parseAmount(form.sale_price_ttc),
            discount_type: form.discount_type || null,
            discount_value: form.discount_type ? parseAmount(form.discount_value) : null,
          }}
          onClose={() => setShowLabel(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
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
