'use client';

import { useEffect, useState } from 'react';
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
}

const COLOR_PRESETS = ['#FFFFFF', '#F5F5F5', '#E8EFE2', '#EFE6D6', '#D8E8D8', '#F0E4D7', '#F3E8E0', '#E6E2D8'];

export default function CategoriesAdmin({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/categories');
    if (r.ok) setItems((await r.json()).categories);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Catégories"
        subtitle="Organisez votre catalogue. Une catégorie peut avoir une couleur ET/OU une image qui s'affichera sur la tuile en caisse."
        actions={canEdit ? (
          <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouvelle catégorie</button>
        ) : null}
      />

      {loading ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="◊"
          title="Aucune catégorie"
          description="Créez vos premières catégories pour structurer votre catalogue produit."
          action={canEdit ? <button className="btn-primary" onClick={() => setEditing(null)}>+ Créer la première</button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => canEdit && setEditing(c)}
              className={`card p-4 text-left ${canEdit ? 'hover:shadow-md hover:border-gray-300' : 'cursor-default'}`}
            >
              <div className="h-24 w-full rounded-xl overflow-hidden grid place-items-center"
                   style={{ background: c.color ?? '#F5F5F5' }}>
                {c.image_url
                  ? <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                  : <span className="text-3xl text-ink-soft">◊</span>}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="font-medium truncate">{c.name}</div>
                {c.visible_in_pos ? <Badge tone="soft">Caisse</Badge> : <Badge tone="neutral">Masquée</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <CategoryFormModal
          category={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ category, onClose, onSaved }: {
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    color: category?.color ?? '#FFFFFF',
    image_url: category?.image_url ?? '',
    visible_in_pos: category?.visible_in_pos ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    const payload = {
      name: form.name.trim(),
      color: form.color,
      image_url: form.image_url.trim() || null,
      visible_in_pos: form.visible_in_pos,
    };
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
      setError(j.error ?? 'Erreur');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card max-w-lg w-full p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        {/* Aperçu */}
        <div className="mb-4 rounded-xl border border-border p-3 bg-white">
          <div className="text-xs uppercase tracking-wider text-ink-soft mb-2">Aperçu en caisse</div>
          <div className="card p-4 max-w-[180px]">
            <div className="h-20 w-full rounded-lg overflow-hidden grid place-items-center"
                 style={{ background: form.color }}>
              {form.image_url
                ? <img src={form.image_url} alt="" className="h-full w-full object-cover"
                       onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <span className="text-2xl text-ink-soft">◊</span>}
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
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button disabled={saving || !form.name.trim()} onClick={() => void submit()} className="btn-primary">
            {saving ? 'Enregistrement…' : (category ? 'Enregistrer' : 'Créer')}
          </button>
        </div>
      </div>
    </div>
  );
}
