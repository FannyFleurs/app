'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface User {
  id: string; email: string; full_name: string;
  role: string; is_active: boolean; has_pin: boolean;
  last_login_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Admin',
  manager: 'Responsable',
  vendeur: 'Vendeur',
  comptable: 'Comptable',
  lecture_seule: 'Lecture seule',
  support_technique: 'Support',
};

const ROLE_DESC: Record<string, string> = {
  owner: 'Tous droits, y compris paramétrage et clôtures annuelles.',
  manager: 'Caisse, produits, clôtures journalières, override prix.',
  vendeur: 'Caisse uniquement, ajout client.',
};

const ASSIGNABLE_ROLES = ['owner', 'manager', 'vendeur'];

export default function UsersAdmin({ canWrite, currentUserId }: { canWrite: boolean; currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null | undefined>(undefined);

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/users');
    if (r.ok) setUsers((await r.json()).users);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  return (
    <div className="p-8 space-y-5 max-w-5xl">
      <Link href="/settings" className="text-sm text-ink-soft hover:text-ink">← Paramètres</Link>
      <PageHeader
        title="Gestion des utilisateurs"
        subtitle="Créez des comptes avec un rôle (Admin / Responsable / Vendeur) et un code PIN à 4 chiffres pour la connexion en caisse."
        actions={canWrite ? (
          <button className="btn-primary" onClick={() => setEditing(null)}>+ Nouvel utilisateur</button>
        ) : null}
      />

      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : users.length === 0 ? (
        <EmptyState icon="◎" title="Aucun utilisateur" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Rôle</th>
                <th className="text-center px-4 py-3">PIN</th>
                <th className="text-left px-4 py-3">Dernière connexion</th>
                <th className="text-center px-4 py-3">État</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {u.full_name}
                    {u.id === currentUserId && <span className="ml-2 text-[10px] text-ink-soft">(moi)</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                  <td className="px-4 py-3"><Badge tone="soft">{ROLE_LABELS[u.role] ?? u.role}</Badge></td>
                  <td className="px-4 py-3 text-center">
                    {u.has_pin
                      ? <Badge tone="success">Défini</Badge>
                      : <Badge tone="warning">Manquant</Badge>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr-FR') : 'Jamais'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.is_active ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <button className="text-accent-deep hover:underline text-sm" onClick={() => setEditing(u)}>
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card p-5">
        <h3 className="font-semibold mb-3">Rôles & permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ASSIGNABLE_ROLES.map((r) => (
            <div key={r} className="rounded-xl border border-border p-3">
              <div className="font-medium">{ROLE_LABELS[r]}</div>
              <div className="mt-1 text-xs text-ink-soft">{ROLE_DESC[r]}</div>
            </div>
          ))}
        </div>
      </section>

      {editing !== undefined && (
        <UserFormModal
          user={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, onClose, onSaved }: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<string>(user?.role ?? 'vendeur');
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!fullName.trim() || !email.trim()) { setError('Nom et email obligatoires.'); return; }
    if (!user && !/^\d{4}$/.test(pin)) { setError('Le PIN doit faire 4 chiffres.'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { setError('Le PIN doit faire 4 chiffres.'); return; }
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      full_name: fullName.trim(),
      email: email.trim(),
      role,
      is_active: isActive,
    };
    if (pin) payload.pin = pin;
    const url = user ? `/api/users/${user.id}` : '/api/users';
    const method = user ? 'PATCH' : 'POST';
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? prettyError(j.error));
      return;
    }
    onSaved();
  }

  function press(k: string) {
    setError(null);
    setPin((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      return cur.length < 4 ? cur + k : cur;
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto" onClick={onClose}>
      <div className="card max-w-md w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{user ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Nom complet</label>
            <input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Email</label>
            <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Rôle</label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {ASSIGNABLE_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-xl border py-2 text-sm font-medium ${
                    role === r ? 'accent-bar text-white border-transparent' : 'bg-white border-border'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-soft">{ROLE_DESC[role]}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-soft">
              Code PIN (4 chiffres) {user && <span className="text-xs">— laisser vide pour ne pas changer</span>}
            </label>
            <div className="mt-2 flex justify-center gap-2">
              {[0,1,2,3].map((i) => (
                <div key={i}
                     className={`h-3 w-3 rounded-full border-2 ${
                       pin.length > i ? 'border-transparent' : 'border-border'
                     }`}
                     style={pin.length > i ? { backgroundColor: 'var(--primary)' } : undefined}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 max-w-[200px] mx-auto">
              {['1','2','3','4','5','6','7','8','9'].map((k) => (
                <button key={k} type="button" onClick={() => press(k)}
                        className="h-11 rounded-xl border border-border bg-white text-lg font-medium hover:bg-gray-50">
                  {k}
                </button>
              ))}
              <button type="button" onClick={() => press('C')}
                      className="h-11 rounded-xl border border-border bg-white text-xs font-medium hover:bg-gray-50">C</button>
              <button type="button" onClick={() => press('0')}
                      className="h-11 rounded-xl border border-border bg-white text-lg font-medium hover:bg-gray-50">0</button>
              <button type="button" onClick={() => press('⌫')}
                      className="h-11 rounded-xl border border-border bg-white text-sm font-medium hover:bg-gray-50">⌫</button>
            </div>
          </div>

          {user && (
            <label className="flex items-center gap-2 text-sm pt-1">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Compte actif
            </label>
          )}
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : (user ? 'Enregistrer' : 'Créer')}
          </button>
        </div>
      </div>
    </div>
  );
}

function prettyError(code?: string): string {
  switch (code) {
    case 'EMAIL_ALREADY_EXISTS': return 'Cet email est déjà utilisé.';
    default: return code ?? 'Erreur';
  }
}
