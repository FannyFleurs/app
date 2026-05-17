'use client';

import { useEffect, useState } from 'react';

interface Category {
  id: string; name: string; color: string | null; position: number; visible_in_pos: boolean;
}

export default function CategoriesAdmin({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#E8EFE2');

  async function reload() {
    const r = await fetch('/api/categories');
    if (r.ok) setItems((await r.json()).categories);
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
    <div className="p-8 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Catégories</h1>
      {canEdit && (
        <div className="card p-4 flex gap-2">
          <input className="input flex-1" placeholder="Nouvelle catégorie" value={name}
                 onChange={(e) => setName(e.target.value)} />
          <input type="color" className="h-11 w-12 rounded-xl border border-border" value={color}
                 onChange={(e) => setColor(e.target.value)} />
          <button className="btn-primary" onClick={() => void add()}>Ajouter</button>
        </div>
      )}
      <div className="card divide-y divide-border">
        {items.length === 0 ? (
          <div className="p-6 text-sm text-ink-soft">Aucune catégorie.</div>
        ) : items.map((c) => (
          <div key={c.id} className="p-3 flex items-center gap-3">
            <span className="h-4 w-4 rounded-full border border-border"
                  style={{ background: c.color ?? '#E8EFE2' }} />
            <span className="font-medium">{c.name}</span>
            <span className="ml-auto text-xs text-ink-soft">
              {c.visible_in_pos ? 'Visible caisse' : 'Masquée'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
