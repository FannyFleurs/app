'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';

interface Category {
  id: string; name: string; color: string | null; position: number; visible_in_pos: boolean;
}

const COLOR_PRESETS = ['#E8EFE2', '#EFE6D6', '#D8E8D8', '#F0E4D7', '#F3E8E0', '#E6E2D8', '#E0DBCF', '#DDE7E0'];

export default function CategoriesAdmin({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#E8EFE2');
  const [loading, setLoading] = useState(true);

  async function reload() {
    const r = await fetch('/api/categories');
    if (r.ok) setItems((await r.json()).categories);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  async function add() {
    if (!name.trim()) return;
    const r = await fetch('/api/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color, position: items.length, visible_in_pos: true }),
    });
    if (r.ok) { setName(''); void reload(); }
  }

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Catégories"
        subtitle="Organisez votre catalogue : bouquets, plantes, cache-pots, services, événements saisonniers."
      />

      {canEdit && (
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-ink-soft">Nouvelle catégorie</label>
              <input
                className="input mt-1"
                placeholder="ex : Saint-Valentin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void add()}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Couleur</label>
              <div className="mt-1 flex items-center gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-9 w-9 rounded-xl border transition-all ${color === c ? 'border-sage scale-110' : 'border-border'}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  className="h-9 w-12 rounded-xl border border-border cursor-pointer"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>
            <button className="btn-primary" onClick={() => void add()} disabled={!name.trim()}>
              Ajouter
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="◊"
          title="Aucune catégorie"
          description="Créez vos premières catégories pour structurer votre catalogue produit."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((c) => (
            <div key={c.id} className="card p-4 flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl border border-border shrink-0"
                style={{ background: c.color ?? '#E8EFE2' }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-ink-soft">
                  {c.visible_in_pos ? 'Visible en caisse' : 'Masquée en caisse'}
                </div>
              </div>
              {c.visible_in_pos && <Badge tone="soft">Caisse</Badge>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
