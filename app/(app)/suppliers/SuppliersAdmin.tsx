'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Badge from '@/components/Badge';

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  product_count?: number;
}

export default function SuppliersAdmin({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/suppliers');
    if (r.ok) setItems((await r.json()).suppliers);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const filtered = q.trim()
    ? items.filter((s) =>
        `${s.name} ${s.contact_name ?? ''} ${s.email ?? ''} ${s.phone ?? ''}`
          .toLowerCase().includes(q.trim().toLowerCase()))
    : items;

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Fournisseurs"
        subtitle="Gérez vos fournisseurs. Chaque article peut être rattaché à un fournisseur."
        actions={canEdit ? (
          <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau fournisseur</button>
        ) : null}
      />

      {items.length > 0 && (
        <input
          className="input max-w-sm"
          placeholder="Rechercher un fournisseur…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

      {loading ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="◊"
          title="Aucun fournisseur"
          description="Créez vos fournisseurs pour les associer à vos articles."
          action={canEdit ? <button className="btn-primary" onClick={() => setEditing(null)}>+ Créer le premier</button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => canEdit && setEditing(s)}
              className={`card p-4 text-left ${canEdit ? 'hover:shadow-md hover:border-gray-300' : 'cursor-default'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">{s.name}</div>
                {s.product_count != null && s.product_count > 0 && (
                  <Badge tone="soft">{s.product_count} article{s.product_count > 1 ? 's' : ''}</Badge>
                )}
              </div>
              <div className="mt-1 text-sm text-ink-soft space-y-0.5">
                {s.contact_name && <div className="truncate">{s.contact_name}</div>}
                {s.phone && <div className="truncate">{s.phone}</div>}
                {s.email && <div className="truncate">{s.email}</div>}
                {!s.contact_name && !s.phone && !s.email && <div className="italic">—</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <SupplierFormModal
          supplier={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
        />
      )}
    </div>
  );
}

function SupplierFormModal({ supplier, onClose, onSaved }: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact_name: supplier?.contact_name ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const res = supplier
      ? await fetch(`/api/suppliers/${supplier.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/suppliers', {
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

  async function archive() {
    if (!supplier) return;
    if (!confirm('Archiver ce fournisseur ? Les articles rattachés le perdront.')) return;
    setSaving(true);
    await fetch(`/api/suppliers/${supplier.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{supplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">✕</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom" full>
            <input className="input" value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })}
                   placeholder="ex : Rungis Fleurs" />
          </Field>
          <Field label="Contact">
            <input className="input" value={form.contact_name}
                   onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                   placeholder="Nom du contact" />
          </Field>
          <Field label="Téléphone">
            <input className="input" value={form.phone}
                   onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email" full>
            <input className="input" type="email" value={form.email}
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Adresse" full>
            <input className="input" value={form.address}
                   onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Notes" full>
            <textarea className="input min-h-[80px]" value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-between gap-2">
          <div>
            {supplier && (
              <button onClick={() => void archive()} disabled={saving} className="btn-ghost text-danger">
                Archiver
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button disabled={saving || !form.name.trim()} onClick={() => void submit()} className="btn-primary">
              {saving ? 'Enregistrement…' : (supplier ? 'Enregistrer' : 'Créer')}
            </button>
          </div>
        </div>
      </div>
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
