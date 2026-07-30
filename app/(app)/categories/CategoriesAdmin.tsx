'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import { useEffect, useState } from 'react';
import { getOrCreateDeviceId } from '@/lib/device';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';

interface Category {
  id: string;
  name: string;
  color: string | null;
  image_url: string | null;
  position: number;
  visible_in_pos: boolean;
  store_ids: string[];
}

const COLOR_PRESETS = ['#FFFFFF', '#F5F5F5', '#E8EFE2', '#EFE6D6', '#D8E8D8', '#F0E4D7', '#F3E8E0', '#E6E2D8'];

export default function CategoriesAdmin({ canEdit, backOffice = false, stores = [] }: {
  canEdit: boolean;
  backOffice?: boolean;
  stores?: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  // Hors BO : boutique du poste (liaison appareil). '' = inconnu, null =
  // résolu sans boutique, string = boutique. On attend sa résolution avant de
  // charger, pour ne pas afficher brièvement les catégories des autres.
  const [posteStoreId, setPosteStoreId] = useState<string | null | ''>(backOffice ? null : '');

  useEffect(() => {
    if (backOffice) return;
    void (async () => {
      try {
        const id = getOrCreateDeviceId();
        const r = await fetch(`/api/registers/mine?device_id=${encodeURIComponent(id)}`);
        const reg = r.ok ? ((await r.json()).register as { store_id?: string } | null) : null;
        setPosteStoreId(reg?.store_id ?? null);
      } catch { setPosteStoreId(null); }
    })();
  }, [backOffice]);
  // Filtre boutique : sert aussi de contexte pour la suppression « de cette
  // boutique uniquement ». Mono-boutique → boutique implicite. Multi → filtre.
  const [filterStore, setFilterStore] = useState('');
  const soleStore = stores.length === 1 ? stores[0]! : null;
  // Boutique cible d'une suppression :
  //  - app (hors BO) : la boutique DU POSTE → « chaque caisse a la main », la
  //    suppression ne retire la catégorie que de sa boutique ;
  //  - BO : la seule boutique accessible, sinon celle filtrée.
  const appPosteStore = !backOffice && typeof posteStoreId === 'string' && posteStoreId
    ? posteStoreId : null;
  const deleteStoreId = appPosteStore ?? (soleStore ? soleStore.id : (filterStore || null));
  const deleteStoreName = deleteStoreId
    ? (stores.find((s) => s.id === deleteStoreId)?.name ?? null)
    : null;

  const visibleItems = filterStore
    ? items.filter((c) => c.store_ids.length === 0 || c.store_ids.includes(filterStore))
    : items;

  async function reload() {
    setLoading(true);
    // Application : on restreint à la boutique du poste (filtrage strict côté
    // serveur hors BO). Back-office : liste complète.
    const qs = !backOffice && posteStoreId ? `?store_id=${encodeURIComponent(posteStoreId)}` : '';
    const r = await fetch(`/api/categories${qs}`);
    if (r.ok) {
      const cats = (await r.json()).categories as Category[];
      setItems(cats.map((c) => ({ ...c, store_ids: c.store_ids ?? [] })));
    }
    setLoading(false);
  }
  useEffect(() => {
    // Hors BO : attendre de connaître la boutique du poste avant de charger.
    if (!backOffice && posteStoreId === '') return;
    void reload();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [posteStoreId, backOffice]);

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Catégories"
        subtitle="Organisez votre catalogue. Une catégorie peut avoir une couleur ET/OU une image qui s'affichera sur la tuile en caisse."
        actions={canEdit ? (
          <div className="flex items-center gap-2">
            {/* Sélecteur de boutique réservé au back-office : sur un poste de
                caisse, les catégories sont déjà scopées à la boutique du poste. */}
            {backOffice && stores.length > 1 && (
              <select className="input h-10 text-sm" value={filterStore} onChange={(e) => setFilterStore(e.target.value)}>
                <option value="">Toutes les boutiques</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouvelle catégorie</button>
          </div>
        ) : null}
      />

      {loading ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon="◊"
          title="Aucune catégorie"
          description="Créez vos premières catégories pour structurer votre catalogue produit."
          action={canEdit ? <button className="btn-primary" onClick={() => setEditing(null)}>+ Créer la première</button> : undefined}
        />
      ) : (
        // Deux fois plus de colonnes = tuiles ~50 % plus petites.
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {visibleItems.map((c) => (
            <button
              key={c.id}
              onClick={() => canEdit && setEditing(c)}
              className={`card p-2.5 text-left ${canEdit ? 'hover:shadow-md hover:border-gray-300' : 'cursor-default'}`}
            >
              {/* Tuile carrée ; sans photo, simple aplat de couleur (pas de losange). */}
              <div className="aspect-square w-full rounded-xl overflow-hidden"
                   style={{ background: c.color ?? '#F5F5F5' }}>
                {c.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-1">
                <div className="font-medium text-sm truncate">{c.name}</div>
                {c.visible_in_pos ? <Badge tone="soft">Caisse</Badge> : <Badge tone="neutral">Masquée</Badge>}
              </div>
              {backOffice && c.store_ids.length > 0 && (
                <div className="mt-1 text-[10px] text-ink-soft truncate">
                  🏪 {c.store_ids.length === 1
                    ? (stores.find((s) => s.id === c.store_ids[0])?.name ?? '1 boutique')
                    : `${c.store_ids.length} boutiques`}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <CategoryFormModal
          category={editing}
          backOffice={backOffice}
          stores={stores}
          posteStoreId={typeof posteStoreId === 'string' && posteStoreId ? posteStoreId : null}
          deleteStoreId={deleteStoreId}
          deleteStoreName={deleteStoreName}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ category, backOffice, stores, posteStoreId, deleteStoreId, deleteStoreName, onClose, onSaved }: {
  category: Category | null;
  backOffice: boolean;
  stores: { id: string; name: string }[];
  posteStoreId?: string | null;
  deleteStoreId?: string | null;
  deleteStoreName?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    color: category?.color ?? '#FFFFFF',
    image_url: category?.image_url ?? '',
    visible_in_pos: category?.visible_in_pos ?? true,
    store_ids: category?.store_ids ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!category) return;
    // Boutique cible connue (mono-boutique ou filtre) : retrait de cette
    // boutique uniquement (la catégorie reste dans les autres). Sinon
    // suppression totale.
    const perStore = !!deleteStoreId;
    const msg = perStore
      ? `Retirer la catégorie « ${category.name} » de la boutique « ${deleteStoreName ?? '' }» ?\n\n`
        + 'Elle restera disponible dans les autres boutiques.'
      : `Supprimer la catégorie « ${category.name} » de TOUTES les boutiques ?\n\n`
        + 'Les articles rattachés ne seront pas supprimés : ils passeront « sans catégorie ».';
    if (!(await confirmThemed({ message: msg }))) return;
    setSaving(true); setError(null);
    const url = perStore
      ? `/api/categories/${category.id}?store_id=${encodeURIComponent(deleteStoreId)}`
      : `/api/categories/${category.id}`;
    const res = await fetch(url, { method: 'DELETE' });
    setSaving(false);
    if (res.ok) onSaved();
    else setError('Suppression impossible.');
  }

  async function submit() {
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      color: form.color,
      image_url: form.image_url.trim() || null,
      visible_in_pos: form.visible_in_pos,
    };
    // Boutiques (même logique que les articles) :
    //  - back-office : sélection explicite. « Toutes » (aucune cochée) est
    //    traduit en la liste EXPLICITE de toutes les boutiques, car le filtre
    //    caisse est strict (store_ids vide = aucune caisse).
    //  - app, NOUVELLE catégorie sur un poste lié : on la scope à la boutique
    //    du poste ;
    //  - app, modification : on ne touche pas au périmètre existant.
    if (backOffice) {
      payload.store_ids = form.store_ids.length > 0 ? form.store_ids : stores.map((s) => s.id);
    } else if (!category && posteStoreId) {
      payload.store_ids = [posteStoreId];
    }
    const res = category
      ? await fetch(`/api/categories/${category.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, position: 0 }),
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
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        {/* Aperçu */}
        <div className="mb-4 rounded-xl border border-border p-3 bg-white">
          <div className="text-xs uppercase tracking-wider text-ink-soft mb-2">Aperçu en caisse</div>
          <div className="card p-4 max-w-[180px]">
            <div className="aspect-square w-full rounded-lg overflow-hidden"
                 style={{ background: form.color }}>
              {form.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_url} alt="" className="h-full w-full object-cover"
                     onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
            </div>
            <div className="mt-2 text-sm font-medium">{form.name || 'Nom catégorie'}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Nom</label>
            <input className="input mt-1" value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })}
                   placeholder="ex : Saint-Valentin" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">URL de l&apos;image (optionnel)</label>
            <input className="input mt-1" value={form.image_url}
                   onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                   placeholder="https://… ou /uploads/categorie.jpg" />
            <p className="mt-1 text-xs text-ink-soft">
              Affichée sur la tuile en caisse. Laissez vide pour utiliser la couleur de fond.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Couleur de fond</label>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-9 w-9 rounded-xl border transition-all ${form.color === c ? 'border-ink scale-110' : 'border-border'}`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                className="h-9 w-12 rounded-xl border border-border cursor-pointer"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.visible_in_pos}
                   onChange={(e) => setForm({ ...form, visible_in_pos: e.target.checked })} />
            Visible sur la grille caisse
          </label>

          {backOffice && stores.length > 0 && (
            <div>
              <label className="text-sm font-medium text-ink-soft">Boutiques concernées</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button type="button"
                  onClick={() => setForm({ ...form, store_ids: [] })}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                    form.store_ids.length === 0 || stores.every((s) => form.store_ids.includes(s.id))
                      ? 'accent-bar text-white border-transparent'
                      : 'bg-white border-border text-ink-soft hover:bg-gray-50'
                  }`}>
                  Toutes
                </button>
                {stores.map((s) => {
                  const on = form.store_ids.includes(s.id);
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setForm({
                        ...form,
                        store_ids: on
                          ? form.store_ids.filter((x) => x !== s.id)
                          : [...form.store_ids, s.id],
                      })}
                      className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                        on
                          ? 'accent-bar text-white border-transparent'
                          : 'bg-white border-border text-ink hover:bg-gray-50'
                      }`}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                « Toutes » = catégorie partagée sur l&apos;ensemble des boutiques.
              </p>
            </div>
          )}
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-between gap-2">
          <div>
            {category && (
              <button type="button" disabled={saving} onClick={() => void remove()} className="btn-soft text-danger">
                🗑 Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button disabled={saving || !form.name.trim()} onClick={() => void submit()} className="btn-primary">
              {saving ? 'Enregistrement…' : (category ? 'Enregistrer' : 'Créer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
