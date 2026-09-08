'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import { useEffect, useRef, useState } from 'react';
import { generateEan13 } from '@/lib/services/ean';
import { getOrCreateDeviceId } from '@/lib/device';
import ProductHistory from './ProductHistory';
import ProductStock from './ProductStock';
import ProductMovement from './ProductMovement';
import LabelPrintModal from './LabelPrintModal';

interface Product {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null;
  extra_barcodes?: string[] | null;
  sale_price_ttc: number; price_is_free: boolean; track_stock?: boolean;
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
  image_url?: string | null;
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
  onSaved: (savedId?: string) => void;
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
    extra_barcodes: (product?.extra_barcodes ?? []) as string[],
    sale_price_ttc: product?.sale_price_ttc != null ? String(product.sale_price_ttc) : '',
    purchase_price_ht: product?.purchase_price_ht != null ? String(product.purchase_price_ht) : '',
    transport_cost_ht: product?.transport_cost_ht != null ? String(product.transport_cost_ht) : '',
    price_is_free: product?.price_is_free ?? false,
    track_stock: product?.track_stock ?? false,
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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<'details' | 'stock' | 'movement' | 'history'>('details');
  const [showLabel, setShowLabel] = useState(false);

  // Création rapide en ligne (catégorie / fournisseur inexistant).
  const [newCat, setNewCat] = useState<string | null>(null);   // null = fermé
  const [newSup, setNewSup] = useState<string | null>(null);
  const [inlineBusy, setInlineBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Photo de l'article : capturée (appareil) ou existante. Enregistrée via
  // l'endpoint dédié après la sauvegarde (la data URL est trop grande pour le
  // POST /api/products). `photo` : data URL locale ; `existingPhoto` : URL déjà
  // stockée sur le produit.
  const [photo, setPhoto] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(product?.image_url ?? null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  /**
   * Archive l'article, ou le remet en service.
   *
   * Archivé, il quitte la caisse : plus de tuile, plus de résultat de
   * recherche, plus de scan. Il n'est pas supprimé pour autant — les ventes
   * passées y renvoient, et l'article se retrouve dans « Produits archivés »
   * (page Stock) d'où un clic le remet en rayon.
   *
   * Enregistré immédiatement, sans passer par « Enregistrer » : c'est une
   * décision à part, pas un champ de la fiche.
   */
  async function toggleArchive() {
    if (!product) return;
    const suivant = !form.is_active;   // true = on remet en service
    if (!suivant && !(await confirmThemed({
      title: `Archiver « ${product.name} »`,
      confirmLabel: 'Archiver',
      message: "L'article disparaîtra de la caisse (tuiles, recherche, scan). "
        + 'Son historique de ventes est conservé, et vous pourrez le remettre en rayon '
        + 'depuis Stock › Produits archivés.',
    }))) return;
    setArchiving(true); setError(null);
    const r = await fetch(`/api/products/${product.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: suivant, visible_in_pos: suivant }),
    });
    setArchiving(false);
    if (!r.ok) { setError("Archivage impossible."); return; }
    setForm((f) => ({ ...f, is_active: suivant, visible_in_pos: suivant }));
    onSaved(product.id);
  }

  async function remove() {
    if (!product) return;
    if (!(await confirmThemed({ title: `Supprimer « ${product.name} »`, danger: true, confirmLabel: 'Supprimer',
      message: "S'il a déjà été vendu, il sera archivé (retiré des listes) pour préserver "
      + "l'historique. Sinon, il sera supprimé définitivement.",
    }))) return;
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
      extra_barcodes: form.extra_barcodes.map((c) => c.trim()).filter(Boolean),
      sale_price_ttc: parseAmount(form.sale_price_ttc),
      purchase_price_ht: parseAmount(form.purchase_price_ht) > 0 ? parseAmount(form.purchase_price_ht) : null,
      transport_cost_ht: form.transport_cost_ht.trim() ? parseAmount(form.transport_cost_ht) : null,
      price_is_free: form.price_is_free,
      track_stock: form.track_stock,
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
    if (!res.ok) {
      setSaving(false);
      const j = await res.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    // Photo prise depuis l'appareil : enregistrée via l'endpoint dédié (la
    // data URL compressée dépasse la limite du POST produit). Retrait pris en
    // charge (image_url vidée) si une photo existante a été retirée.
    let nouvelId: string | undefined;
    if (!product) { try { nouvelId = (await res.json()).id as string; } catch { /* ignore */ } }
    const photoRemoved = !photo && !existingPhoto && !!product?.image_url;
    if (photo || photoRemoved) {
      const id = product?.id ?? nouvelId;
      if (id) {
        await fetch(`/api/products/${id}/photo`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: photo ?? '' }),
        }).catch(() => { /* non bloquant */ });
      }
    }
    setSaving(false);
    setSavedAt(Date.now());
    onSaved(nouvelId ?? product?.id);
  }

  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    compressImageFile(file, 900, 0.7).then(setPhoto).catch(() => setError('Photo illisible.'));
  }

  return (
    <div className={inline
      ? 'p-4 sm:p-6'
      : 'fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-2 sm:p-4 overflow-auto'}>
      <div className={inline
        ? 'card w-full p-4 sm:p-6'
        : 'card w-full max-w-7xl p-4 sm:p-6 my-4 sm:my-8'}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold">{product ? 'Modifier produit' : 'Nouveau produit'}</h2>
            {product && !form.is_active && (
              <span className="rounded-full bg-warning/15 text-warning px-2 py-0.5 text-xs font-medium">
                Archivé — hors caisse
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none"
                  title={inline ? 'Fermer la fiche' : 'Fermer'}>✕</button>
        </div>

        {/* Onglets Détails / Historique (l'historique n'existe que pour un
            produit déjà créé). */}
        {product && (
          <div className="mb-4 flex gap-1 border-b border-border">
            {(['details', 'stock', 'movement', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-[color:var(--primary)] text-ink'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {t === 'details' ? 'Détails'
                  : t === 'stock' ? 'Stock'
                  : t === 'movement' ? 'Mouvement de stock'
                  : 'Historique'}
              </button>
            ))}
          </div>
        )}

        {tab === 'history' && product ? (
          <ProductHistory productId={product.id} />
        ) : tab === 'stock' && product ? (
          <ProductStock productId={product.id} storeId={posteStoreOverride ?? undefined} />
        ) : tab === 'movement' && product ? (
          <ProductMovement
            productId={product.id}
            productName={form.name || product.name}
            sku={form.sku || null}
            storeId={posteStoreId ?? undefined}
            stores={stores}
          />
        ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)] gap-4">

          {/* COLONNE PRINCIPALE */}
          <div className="space-y-4">

            {/* 1. INFORMATIONS PRODUIT */}
            <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--primary)]/10 text-lg">
                  ◇
                </div>
                <div>
                  <h3 className="font-semibold text-ink">1. Informations produit</h3>
                  <p className="text-sm text-ink-soft">
                    Identifiez l&apos;article et renseignez ses informations principales.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <Field label="Nom de l'article">
                  <input
                    className="input h-11 text-base"
                    value={form.name}
                    placeholder="Ex. Monstera Deliciosa"
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Catégorie">
                    {newCat === null ? (
                      <div className="flex gap-2">
                        <select
                          className="input h-11 text-base flex-1"
                          value={form.category_id ?? ''}
                          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                        >
                          <option value="">— Aucune catégorie —</option>
                          {liveCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-soft whitespace-nowrap"
                          onClick={() => setNewCat('')}
                        >
                          + Créer
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          className="input h-11 flex-1"
                          autoFocus
                          value={newCat}
                          placeholder="Nom de la catégorie"
                          onChange={(e) => setNewCat(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void addCategory();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary whitespace-nowrap"
                          disabled={inlineBusy || !newCat.trim()}
                          onClick={() => void addCategory()}
                        >
                          Ajouter
                        </button>
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
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-soft whitespace-nowrap"
                          onClick={() => setNewSup('')}
                        >
                          + Créer
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          className="input h-11 flex-1"
                          autoFocus
                          value={newSup}
                          placeholder="Nom du fournisseur"
                          onChange={(e) => setNewSup(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void addSupplier();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary whitespace-nowrap"
                          disabled={inlineBusy || !newSup.trim()}
                          onClick={() => void addSupplier()}
                        >
                          Ajouter
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => setNewSup(null)}>✕</button>
                      </div>
                    )}
                  </Field>
                </div>

                <Field label="Description courte">
                  <input
                    className="input h-11 text-base"
                    value={form.short_description}
                    placeholder="Ex. Plante d'intérieur facile d'entretien…"
                    onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                  />
                </Field>
              </div>
            </section>

            {/* 2. PRIX ET MARGE */}
            <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--primary)]/10 text-xl font-semibold">
                  €
                </div>
                <div>
                  <h3 className="font-semibold text-ink">2. Prix et marge</h3>
                  <p className="text-sm text-ink-soft">
                    Renseignez les prix pour calculer automatiquement la marge.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Prix d'achat HT (€)">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input h-11 text-base"
                    value={form.purchase_price_ht}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchase_price_ht: e.target.value.replace(/[^0-9.,]/g, ''),
                      })
                    }
                    placeholder="0,00"
                  />
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

                <Field label="Prix de vente TTC (€)">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input h-11 text-base"
                    value={form.sale_price_ttc}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sale_price_ttc: e.target.value.replace(/[^0-9.,]/g, ''),
                      })
                    }
                    disabled={form.price_is_free}
                    placeholder="0,00"
                  />
                </Field>
              </div>

              <div className="mt-4">
                {(() => {
                  const purchase = parseAmount(form.purchase_price_ht);
                  const transport = parseAmount(form.transport_cost_ht);
                  const sellTtc = parseAmount(form.sale_price_ttc);
                  const taxRate = taxRates.find((t) => t.id === form.tax_rate_id)?.rate ?? 0;
                  const sellHt = sellTtc / (1 + taxRate / 100);
                  const cost = purchase + transport;

                  if (purchase <= 0 || sellHt <= 0) {
                    return (
                      <div className="rounded-2xl bg-[color:var(--primary)]/5 px-4 py-4">
                        <div className="text-sm font-medium text-ink">Marge estimée</div>
                        <div className="mt-1 text-sm text-ink-soft">
                          Renseignez le prix d&apos;achat HT et le prix de vente TTC pour afficher la marge.
                        </div>
                      </div>
                    );
                  }

                  const margin = sellHt - cost;
                  const marginPct = (margin / sellHt) * 100;
                  const coeff = cost > 0 ? sellHt / cost : 0;

                  return (
                    <div className="rounded-2xl bg-[color:var(--primary)]/5 px-4 py-4">
                      <div className="mb-3 text-sm font-medium text-ink">Marge estimée</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Stat
                          label="Marge brute"
                          value={`${margin.toFixed(2)} €`}
                          tone={margin > 0 ? 'success' : 'danger'}
                        />
                        <Stat
                          label="Taux de marge"
                          value={`${marginPct.toFixed(1)} %`}
                          tone={marginPct >= 50 ? 'success' : marginPct >= 30 ? 'warning' : 'danger'}
                        />
                        <Stat label="Coefficient" value={`× ${coeff.toFixed(2)}`} />
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Coût transport HT (€)">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input h-11 text-base"
                    value={form.transport_cost_ht}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        transport_cost_ht: e.target.value.replace(/[^0-9.,]/g, ''),
                      })
                    }
                    placeholder="Hérité de la catégorie"
                  />
                  <p className="mt-1 text-xs text-ink-soft">
                    Laissez vide pour utiliser le coût défini dans la catégorie.
                  </p>
                </Field>

                <Field label="Remise affichée sur l'étiquette">
                  <div className="flex gap-2">
                    <select
                      className="input h-11 flex-1"
                      value={form.discount_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discount_type: e.target.value as '' | 'percent' | 'amount',
                        })
                      }
                    >
                      <option value="">Aucune remise</option>
                      <option value="percent">Pourcentage (%)</option>
                      <option value="amount">Montant (€)</option>
                    </select>

                    {form.discount_type && (
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input h-11 w-28"
                        value={form.discount_value}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount_value: e.target.value.replace(/[^0-9.,]/g, ''),
                          })
                        }
                        placeholder={form.discount_type === 'percent' ? '20' : '5,00'}
                      />
                    )}
                  </div>

                  {form.discount_type && parseAmount(form.discount_value) > 0 && (() => {
                    const price = parseAmount(form.sale_price_ttc);
                    const raw =
                      form.discount_type === 'percent'
                        ? price * (1 - parseAmount(form.discount_value) / 100)
                        : price - parseAmount(form.discount_value);
                    const discounted = Math.max(0, raw);

                    return (
                      <div className="mt-2 text-sm">
                        <span className="mr-2 text-ink-soft line-through">
                          {price.toFixed(2)} €
                        </span>
                        <span className="font-semibold text-success">
                          {discounted.toFixed(2)} €
                        </span>
                      </div>
                    );
                  })()}
                </Field>
              </div>
            </section>

            {/* 5. REFERENCES */}
            <details className="group rounded-2xl border border-border bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--primary)]/10">
                    ▥
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink">5. Références et codes-barres</h3>
                    <p className="text-sm text-ink-soft">
                      SKU, code-barres principal et codes additionnels.
                    </p>
                  </div>
                </div>
                <span className="text-xl text-ink-soft transition-transform group-open:rotate-180">⌄</span>
              </summary>

              <div className="border-t border-border px-4 pb-5 pt-4 sm:px-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="SKU">
                    <input
                      className="input h-11"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    />
                  </Field>

                  <Field label="Code-barres principal">
                    <div className="flex gap-2">
                      <input
                        className="input h-11 flex-1"
                        value={form.barcode}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                        placeholder="EAN-13"
                        maxLength={13}
                      />
                      <button
                        type="button"
                        className="btn-soft whitespace-nowrap text-xs"
                        onClick={() => setForm({ ...form, barcode: generateEan13('20') })}
                      >
                        Générer EAN
                      </button>
                    </div>
                  </Field>
                </div>

                <div className="mt-4 space-y-2">
                  {form.extra_barcodes.map((code, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        className="input h-11 flex-1"
                        value={code}
                        onChange={(e) => {
                          const next = [...form.extra_barcodes];
                          next[idx] = e.target.value;
                          setForm({ ...form, extra_barcodes: next });
                        }}
                        placeholder="Code-barres supplémentaire"
                        maxLength={80}
                      />
                      <button
                        type="button"
                        className="btn-ghost px-3 text-danger"
                        onClick={() =>
                          setForm({
                            ...form,
                            extra_barcodes: form.extra_barcodes.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn-soft text-xs"
                    onClick={() =>
                      setForm({
                        ...form,
                        extra_barcodes: [...form.extra_barcodes, ''],
                      })
                    }
                  >
                    + Ajouter un code-barres
                  </button>
                </div>
              </div>
            </details>

            {/* OPTIONS AVANCEES */}
            <details className="group rounded-2xl border border-border bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--primary)]/10">
                    ⚙
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink">Options avancées</h3>
                    <p className="text-sm text-ink-soft">
                      Réglages complémentaires de l&apos;article.
                    </p>
                  </div>
                </div>
                <span className="text-xl text-ink-soft transition-transform group-open:rotate-180">⌄</span>
              </summary>

              <div className="border-t border-border px-4 pb-5 pt-4 sm:px-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Check
                    label="Prix libre"
                    checked={form.price_is_free}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        price_is_free: v,
                        sale_price_ttc: v ? '' : form.sale_price_ttc,
                      })
                    }
                  />
                  <Check
                    label="Article saisonnier"
                    checked={form.is_seasonal}
                    onChange={(v) => setForm({ ...form, is_seasonal: v })}
                  />
                  <Check
                    label="Article personnalisable"
                    checked={form.is_customizable}
                    onChange={(v) => setForm({ ...form, is_customizable: v })}
                  />
                  <Check
                    label="Exclure des remises"
                    checked={form.no_discount}
                    onChange={(v) => setForm({ ...form, no_discount: v })}
                  />
                </div>

                {product && (
                  <div className="mt-4">
                    <Field label="Raison du changement de prix">
                      <input
                        className="input h-11"
                        value={form.price_change_reason}
                        onChange={(e) =>
                          setForm({ ...form, price_change_reason: e.target.value })
                        }
                        placeholder="Ex. hausse fournisseur, promotion…"
                      />
                      <p className="mt-1 text-xs text-ink-soft">
                        Le changement de prix est enregistré dans l&apos;historique de l&apos;article.
                      </p>
                    </Field>
                  </div>
                )}
              </div>
            </details>
          </div>

          {/* COLONNE DROITE */}
          <div className="space-y-4">

            {/* PHOTO */}
            <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <h3 className="mb-3 font-semibold text-ink">Photo de l&apos;article</h3>

              <div className="flex flex-wrap items-center gap-4">
                <div className="grid h-36 w-36 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-border bg-gray-50">
                  {(photo || existingPhoto) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(photo || existingPhoto)!}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="px-3 text-center text-xs text-ink-soft">
                      Aucune photo
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="btn-soft h-10 px-3 text-sm"
                  >
                    📷 {photo || existingPhoto ? 'Changer la photo' : 'Prendre une photo'}
                  </button>

                  {(photo || existingPhoto) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhoto(null);
                        setExistingPhoto(null);
                      }}
                      className="block text-xs text-danger hover:underline"
                    >
                      Retirer la photo
                    </button>
                  )}
                </div>
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onPhotoFile}
              />

              <p className="mt-3 text-xs text-ink-soft">
                Sert de vignette en caisse et sur le PDA.
              </p>
            </section>

            {/* 3. STOCK */}
            <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--primary)]/10">
                  ◇
                </div>
                <div>
                  <h3 className="font-semibold text-ink">3. Stock et disponibilité</h3>
                  <p className="text-sm text-ink-soft">
                    Gérez le stock et choisissez où l&apos;article est disponible.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-ink">Gérer le stock</div>
                    <div className="text-xs text-ink-soft">
                      Décompte automatiquement les ventes.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.track_stock}
                    onClick={() =>
                      setForm({ ...form, track_stock: !form.track_stock })
                    }
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                      form.track_stock ? 'bg-[color:var(--primary)]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        form.track_stock ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-ink">Disponible en caisse</div>
                    <div className="text-xs text-ink-soft">
                      Affiche l&apos;article dans la caisse.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.visible_in_pos}
                    onClick={() =>
                      setForm({ ...form, visible_in_pos: !form.visible_in_pos })
                    }
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                      form.visible_in_pos ? 'bg-[color:var(--primary)]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        form.visible_in_pos ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>

              {backOffice && stores.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-3 text-sm font-semibold text-ink">Boutiques concernées</div>

                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="product-store-scope"
                        checked={
                          form.store_ids.length === 0 ||
                          stores.every((s) => form.store_ids.includes(s.id))
                        }
                        onChange={() => setForm({ ...form, store_ids: [] })}
                      />
                      <span>Toutes les boutiques</span>
                    </label>

                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="product-store-scope"
                        checked={
                          form.store_ids.length > 0 &&
                          !stores.every((s) => form.store_ids.includes(s.id))
                        }
                        onChange={() =>
                          setForm({
                            ...form,
                            store_ids: stores[0] ? [stores[0].id] : [],
                          })
                        }
                      />
                      <span>Certaines boutiques</span>
                    </label>

                    {form.store_ids.length > 0 &&
                      !stores.every((s) => form.store_ids.includes(s.id)) && (
                        <div className="ml-6 space-y-2 rounded-xl bg-gray-50 p-3">
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
                  </div>
                </div>
              )}
            </section>

            {/* 4. AFFICHAGE CAISSE */}
            <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--primary)]/10">
                  ▣
                </div>
                <div>
                  <h3 className="font-semibold text-ink">4. Affichage en caisse</h3>
                  <p className="text-sm text-ink-soft">
                    Personnalisez l&apos;apparence de l&apos;article sur la caisse.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4">
                <div>
                  <div className="mb-2 text-xs font-medium text-ink-soft">Aperçu de la tuile</div>
                  <div
                    className="overflow-hidden rounded-2xl border border-border p-2 shadow-sm"
                    style={{ backgroundColor: form.color ?? '#fff' }}
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-white/70">
                      {(photo || existingPhoto) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(photo || existingPhoto)!}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-ink-soft">
                          Photo
                        </div>
                      )}
                    </div>
                    <div className="mt-2 truncate text-center text-sm font-medium">
                      {form.name || 'Nom article'}
                    </div>
                    <div className="text-center text-sm font-semibold">
                      {parseAmount(form.sale_price_ttc).toFixed(2)} €
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium text-ink-soft">Couleur de la tuile</div>
                  <div className="flex flex-wrap gap-2">
                    {PRODUCT_COLORS.map((c) => {
                      const selected = form.color === c.value;

                      return (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => setForm({ ...form, color: c.value })}
                          title={c.label}
                          className={`h-9 w-9 rounded-lg border transition-all ${
                            selected ? 'ring-2 shadow-sm' : 'hover:scale-105'
                          } ${
                            c.value === null
                              ? 'border-dashed border-border bg-white'
                              : 'border-border'
                          }`}
                          style={{
                            backgroundColor: c.value ?? '#fff',
                            ...(selected
                              ? { ['--tw-ring-color' as string]: 'var(--primary)' }
                              : {}),
                          }}
                        >
                          {c.value === null && (
                            <span className="text-xs text-ink-soft">—</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_top_product}
                      onChange={(e) =>
                        setForm({ ...form, is_top_product: e.target.checked })
                      }
                    />
                    <span>Épingler en haut de la caisse</span>
                  </label>

                  {form.is_top_product && (
                    <p className="mt-2 text-xs text-ink-soft">
                      Les produits épinglés sont affichés en priorité dans la grille caisse.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
        )}
        {error && tab === 'details' && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {tab === 'details' ? (
          <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap justify-between gap-2 border-t border-border bg-white/95 py-3 backdrop-blur">
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowLabel(true)}
                      className="btn-soft" title="Imprimer une étiquette avec code-barres et prix">
                Imprimer étiquette
              </button>
              {product && (
                <button type="button" onClick={() => void toggleArchive()} disabled={archiving}
                        className="btn-soft"
                        title={form.is_active
                          ? 'Retirer cet article de la caisse (conserve son historique)'
                          : 'Remettre cet article en caisse'}>
                  {archiving ? '…' : form.is_active ? 'Archiver' : 'Désarchiver'}
                </button>
              )}
              {product && (
                <button type="button" onClick={() => void remove()} disabled={deleting}
                        className="btn-soft text-danger" title="Supprimer cet article">
                  {deleting ? 'Suppression…' : '🗑 Supprimer'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {savedAt !== null && (
                <span className="text-sm text-success font-medium">✓ Enregistré</span>
              )}
              <button onClick={onClose} className="btn-ghost">Fermer</button>
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
          // Boutique du poste : sélectionne l'imprimante étiquettes de CETTE
          // boutique quand plusieurs sont déclarées.
          storeId={posteStoreOverride ?? null}
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

/** Réduit une image (fichier) en data URL JPEG compressée (capture PDA/mobile). */
function compressImageFile(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load error')); };
    img.src = url;
  });
}
