'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { confirmThemed } from '@/lib/ui/dialog';
import { formatRate } from '@/lib/services/accounting-mapping';

/**
 * Plan de comptes de ventes : un compte par famille de produit, taux de TVA et
 * boutique.
 *
 * Chaque critère peut rester à « Toutes », ce qui évite d'avoir à saisir une
 * ligne par croisement : une règle large sert de socle, les cas particuliers se
 * posent par-dessus et l'emportent. C'est l'export qui applique cette règle du
 * plus spécifique, pas cet écran — il ne fait que la donner à voir.
 */

interface Row {
  id: string;
  store_id: string | null;
  category_id: string | null;
  vat_rate: number | null;
  account_code: string;
  account_label: string;
  store_name: string | null;
  category_name: string | null;
}

interface Ref { id: string; name: string }

const TOUTES = '';

export default function AccountingAccountsAdmin({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stores, setStores] = useState<Ref[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState('');
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);

  async function reload() {
    setLoading(true);
    const [a, s, c] = await Promise.all([
      fetch('/api/settings/accounting-accounts').then((r) => (r.ok ? r.json() : { accounts: [] })),
      fetch('/api/stores').then((r) => (r.ok ? r.json() : { stores: [] })).catch(() => ({ stores: [] })),
      fetch('/api/categories').then((r) => (r.ok ? r.json() : { categories: [] })).catch(() => ({ categories: [] })),
    ]);
    setRows(a.accounts ?? []);
    setStores((s.stores ?? []).map((x: Ref) => ({ id: x.id, name: x.name })));
    setCategories((c.categories ?? []).map((x: Ref) => ({ id: x.id, name: x.name })));
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const visible = filterStore
    // Une règle « toutes boutiques » concerne aussi la boutique filtrée : la
    // masquer donnerait l'impression qu'aucun compte ne s'applique.
    ? rows.filter((r) => r.store_id === null || r.store_id === filterStore)
    : rows;

  async function remove(r: Row) {
    if (!(await confirmThemed({
      message: `Supprimer le compte ${r.account_code} — ${r.account_label} ?`,
    }))) return;
    const res = await fetch(`/api/settings/accounting-accounts/${r.id}`, { method: 'DELETE' });
    if (res.ok) void reload();
    else setError('Suppression impossible.');
  }

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Comptes de ventes"
        subtitle="Le compte comptable de chaque famille de produit, par taux de TVA et par boutique. C'est cette ventilation que reprend l'export « Ventes par compte »."
        actions={canEdit ? (
          <div className="flex items-center gap-2">
            {stores.length > 1 && (
              <select className="input h-10 text-sm" value={filterStore}
                      onChange={(e) => setFilterStore(e.target.value)}>
                <option value="">Toutes les boutiques</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouveau compte</button>
          </div>
        ) : null}
      />

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="◊"
          title="Aucun compte paramétré"
          description="Sans règle, tout est regroupé sur le compte de ventes global. Ajoutez un compte par famille pour obtenir la ventilation attendue par votre comptable."
          action={canEdit ? <button className="btn-primary" onClick={() => setEditing(null)}>+ Créer le premier</button> : undefined}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-soft border-b border-border">
                <Th>Compte</Th><Th>Libellé</Th><Th>Boutique</Th><Th>Famille</Th><Th>TVA</Th><Th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-gray-50/60">
                  <Td><span className="font-mono">{r.account_code}</span></Td>
                  <Td>{r.account_label}</Td>
                  <Td>{r.store_name ?? <Toutes />}</Td>
                  <Td>{r.category_name ?? <Toutes />}</Td>
                  <Td>{r.vat_rate === null ? <Toutes /> : `${formatRate(r.vat_rate)} %`}</Td>
                  <Td>
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost text-xs h-8 px-2" onClick={() => setEditing(r)}>Modifier</button>
                        <button className="btn-ghost text-xs h-8 px-2 text-danger" onClick={() => void remove(r)}>Supprimer</button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <AccountForm
          row={editing}
          stores={stores}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
        />
      )}
    </div>
  );
}

function Toutes() {
  return <span className="text-ink-soft italic">Toutes</span>;
}
function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-3 py-2.5 align-middle">{children}</td>;
}

function AccountForm({ row, stores, categories, onClose, onSaved }: {
  row: Row | null;
  stores: Ref[];
  categories: Ref[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    store_id: row?.store_id ?? TOUTES,
    category_id: row?.category_id ?? TOUTES,
    vat_rate: row?.vat_rate === null || row === null ? '' : String(row.vat_rate),
    account_code: row?.account_code ?? '',
    account_label: row?.account_label ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    const payload = {
      store_id: form.store_id || null,
      category_id: form.category_id || null,
      vat_rate: form.vat_rate.trim() === '' ? null : Number(form.vat_rate.replace(',', '.')),
      account_code: form.account_code.trim(),
      account_label: form.account_label.trim(),
    };
    const res = row
      ? await fetch(`/api/settings/accounting-accounts/${row.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/settings/accounting-accounts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Enregistrement impossible.');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card w-full max-w-xl p-6 my-8 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{row ? 'Modifier le compte' : 'Nouveau compte'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Fermer">✕</button>
        </div>

        <p className="text-sm text-ink-soft">
          Laissez un critère sur « Toutes » pour qu&apos;il ne restreigne pas la règle.
          Entre deux règles applicables, c&apos;est la plus précise qui l&apos;emporte.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="N° de compte">
            <input className="input font-mono" value={form.account_code}
                   onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                   placeholder="70731200" />
          </Field>
          <Field label="Taux de TVA (%)">
            <input className="input" value={form.vat_rate}
                   onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
                   placeholder="Toutes" />
          </Field>
          <Field label="Libellé" full>
            <input className="input" value={form.account_label}
                   onChange={(e) => setForm({ ...form, account_label: e.target.value })}
                   placeholder="PLANTES 10% PLANTES VERTE" />
          </Field>
          <Field label="Boutique">
            <select className="input" value={form.store_id}
                    onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
              <option value={TOUTES}>Toutes</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Famille de produit">
            <select className="input" value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value={TOUTES}>Toutes</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button className="btn-primary" disabled={saving || !form.account_code.trim() || !form.account_label.trim()}
                  onClick={() => void submit()}>
            {saving ? 'Enregistrement…' : (row ? 'Enregistrer' : 'Créer')}
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
