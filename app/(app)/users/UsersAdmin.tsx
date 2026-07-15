'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface User {
  id: string; email: string; full_name: string;
  role: string; is_active: boolean; has_pin: boolean;
  pin_required?: boolean;
  last_login_at: string | null;
  color?: string | null;
  store_ids?: string[];
}

interface Store { id: string; code: string; name: string; is_active: boolean; }

const USER_COLORS = ['#F4A09B', '#7AD09A', '#F0C25A', '#8FD5DA', '#C58EC2', '#9DB4F0', '#F39A6A', '#B39DDB', '#4DB6AC'];

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
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null | undefined>(undefined);

  async function reload() {
    setLoading(true);
    const [uRes, sRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/stores'),
    ]);
    if (uRes.ok) setUsers((await uRes.json()).users);
    if (sRes.ok) setStores(((await sRes.json()).stores ?? []).filter((s: Store) => s.is_active));
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  // Nom lisible des boutiques d'un user (pour la colonne du tableau).
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? '—';

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-5xl">
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
                <th className="text-left px-4 py-3">Boutiques</th>
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
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    {!u.store_ids || u.store_ids.length === 0
                      ? <span className="text-ink-soft/70">Toutes</span>
                      : u.store_ids.length === stores.length
                        ? 'Toutes'
                        : u.store_ids.map(storeName).join(', ')}
                  </td>
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
          stores={stores}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, stores, onClose, onSaved }: {
  user: User | null;
  stores: Store[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<string>(user?.role ?? 'vendeur');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [pinRequired, setPinRequired] = useState(user?.pin_required ?? true);
  const [color, setColor] = useState<string | null>(user?.color ?? null);
  // Boutiques rattachees. A la creation : toutes cochees par defaut.
  // A l'edition : l'existant (vide = toutes, on precoche tout).
  const [storeIds, setStoreIds] = useState<Set<string>>(() => {
    if (user && user.store_ids && user.store_ids.length > 0) {
      return new Set(user.store_ids);
    }
    return new Set(stores.map((s) => s.id));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStore(id: string) {
    setStoreIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!fullName.trim()) { setError('Nom obligatoire.'); return; }
    // Email facultatif : requis seulement si l'utilisateur aura accès au
    // back-office (email + mot de passe), c.-à-d. si un mot de passe est
    // défini. Un vendeur caisse (PIN seul) n'a pas besoin d'email.
    if (password && !email.trim()) {
      setError('Un email est requis pour la connexion par mot de passe (back-office).'); return;
    }
    if (!user && pinRequired && !/^\d{4}$/.test(pin)) {
      setError('Le PIN doit faire 4 chiffres.'); return;
    }
    if (pin && !/^\d{4}$/.test(pin)) { setError('Le PIN doit faire 4 chiffres.'); return; }
    if (password && password.length < 8) {
      setError('Mot de passe : 8 caractères minimum.'); return;
    }
    if (password && password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas.'); return;
    }
    if (stores.length > 0 && storeIds.size === 0) {
      setError('Sélectionnez au moins une boutique.'); return;
    }
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      full_name: fullName.trim(),
      email: email.trim(),
      role,
      is_active: isActive,
      pin_required: pinRequired,
    };
    if (pin) payload.pin = pin;
    if (password) payload.password = password;
    // color: on envoie meme si null pour permettre de reset a l'auto
    payload.color = color;
    // Boutiques : on transmet la liste exacte (l'API remplace les acces).
    if (stores.length > 0) payload.store_ids = Array.from(storeIds);
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
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8" onClick={(e) => e.stopPropagation()}>
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
            <label className="text-sm font-medium text-ink-soft">
              Email <span className="text-xs text-ink-soft">(optionnel — requis seulement pour la connexion back-office)</span>
            </label>
            <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="Facultatif pour un vendeur (PIN seul)" />
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

          {stores.length > 0 && (
            <div>
              <label className="text-sm font-medium text-ink-soft">
                Boutiques
                <span className="text-xs text-ink-soft ml-1">
                  — où cet utilisateur apparaît sur l&apos;écran de connexion
                </span>
              </label>
              <div className="mt-2 flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setStoreIds(new Set(stores.map((s) => s.id)))}
                  className="text-xs text-accent-deep hover:underline"
                >
                  Tout cocher
                </button>
                <span className="text-ink-soft/50">·</span>
                <button
                  type="button"
                  onClick={() => setStoreIds(new Set())}
                  className="text-xs text-ink-soft hover:underline"
                >
                  Tout décocher
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {stores.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                      storeIds.has(s.id) ? 'border-accent bg-accent-soft/40' : 'border-border'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={storeIds.has(s.id)}
                      onChange={() => toggleStore(s.id)}
                    />
                    <span className="font-mono text-xs text-ink-soft">{s.code}</span>
                    <span className="truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-ink-soft">
              Couleur d&apos;étiquette
              <span className="text-xs text-ink-soft ml-1">— pastille + avatar sur l&apos;écran de connexion</span>
            </label>
            <div className="mt-2 flex items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                title="Couleur automatique (basée sur le nom)"
                className={`h-9 px-3 rounded-lg border text-xs font-medium ${
                  color === null ? 'accent-bar text-white border-transparent' : 'bg-white border-border text-ink'
                }`}
              >
                Auto
              </button>
              {USER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Couleur ${c}`}
                  className={`h-9 w-9 rounded-lg border-2 transition-transform ${
                    color === c ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-soft">
              Mot de passe (8 caractères min.)
              {user && <span className="text-xs"> — laisser vide pour ne pas changer</span>}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input flex-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={user ? 'Nouveau mot de passe' : 'Mot de passe'}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="btn-ghost text-xs px-3"
                tabIndex={-1}
              >
                {showPassword ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {password.length > 0 && (
              <input
                type={showPassword ? 'text' : 'password'}
                className="input mt-2"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Confirmer le mot de passe"
                autoComplete="new-password"
              />
            )}
            {password.length > 0 && passwordConfirm.length > 0 && password !== passwordConfirm && (
              <p className="mt-1 text-xs text-danger">Les mots de passe ne correspondent pas.</p>
            )}
            <p className="mt-1 text-xs text-ink-soft">
              Sert à la connexion au back-office (bo.) et au suivi du CA
              (email + mot de passe). Le PIN sert uniquement en caisse.
            </p>
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

          <div className="pt-1 space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pinRequired}
                     onChange={(e) => setPinRequired(e.target.checked)} />
              Demander le code PIN à la connexion
            </label>
            {!pinRequired && (
              <p className="text-[11px] text-warning ml-6">
                ⚠ Cet utilisateur sera connecté en un clic sur sa tuile (sans saisie).
                À réserver aux postes physiquement sécurisés.
              </p>
            )}
            {user && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive}
                       onChange={(e) => setIsActive(e.target.checked)} />
                Compte actif
              </label>
            )}
          </div>

          {user && (
            <UserPermissionOverrides userId={user.id} />
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

interface PermOverride { permission: string; granted: boolean }

/**
 * Permissions individuelles : permet d'accorder ou révoquer une
 * permission pour CET utilisateur seulement, indépendamment de son rôle.
 * Exemple : un vendeur dont le profil n'a pas l'accès stock, mais qu'on
 * autorise quand même à ajuster le stock.
 */
function UserPermissionOverrides({ userId }: { userId: string }) {
  const PERMISSION_LABELS: Record<string, string> = {
    'pos.use': 'Accéder à la caisse',
    'pos.override_price': 'Forcer un prix libre',
    'pos.discount_line': 'Remise sur ligne',
    'pos.discount_cart': 'Remise sur ticket',
    'pos.refund': 'Remboursement / retour',
    'pos.settings.write': 'Modifier paramètres caisse',
    'products.read': 'Voir le catalogue',
    'products.write': 'Créer / modifier produits',
    'categories.write': 'Gérer les catégories',
    'stock.adjust': 'Ajuster le stock',
    'customers.read': 'Voir les clients',
    'customers.write': 'Créer / modifier clients',
    'invoices.create': 'Créer une facture',
    'invoices.validate': 'Valider une facture',
    'closures.daily': 'Clôture journalière',
    'closures.monthly': 'Clôture mensuelle',
    'closures.yearly': 'Clôture annuelle',
    'fiscal.audit': 'Audit fiscal',
    'fiscal.export': 'Exports comptables',
    'users.read': 'Voir les utilisateurs',
    'users.write': 'Gérer les utilisateurs',
    'settings.read': 'Voir les paramètres',
    'settings.write': 'Modifier les paramètres',
  };
  const [overrides, setOverrides] = useState<PermOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/users/${userId}/permissions`);
      if (r.ok) {
        const j = await r.json();
        setOverrides(j.overrides ?? []);
      }
      setLoading(false);
    })();
  }, [userId]);

  async function apply(permission: string, granted: boolean | null) {
    setBusy(permission);
    const r = await fetch(`/api/users/${userId}/permissions`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission, granted }),
    });
    setBusy(null);
    if (!r.ok) return;
    setOverrides((cur) => {
      const filtered = cur.filter((o) => o.permission !== permission);
      return granted === null ? filtered : [...filtered, { permission, granted }];
    });
  }

  function getOverride(p: string): boolean | null {
    return overrides.find((o) => o.permission === p)?.granted ?? null;
  }

  if (loading) return null;

  return (
    <div className="pt-3 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-accent-deep hover:underline"
      >
        {open ? '▾' : '▸'} Permissions individuelles
        {overrides.length > 0 && (
          <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full text-[10px] font-semibold accent-bar text-white">
            {overrides.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <p className="mt-1 text-xs text-ink-soft">
            Surcharge le rôle pour CET utilisateur uniquement. Les autres
            utilisateurs du même rôle ne sont pas affectés.
          </p>
          <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto pr-1">
            {Object.entries(PERMISSION_LABELS).map(([p, label]) => {
              const ov = getOverride(p);
              const isBusy = busy === p;
              return (
                <li key={p} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1 truncate">{label}</span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void apply(p, ov === false ? null : false)}
                      disabled={isBusy}
                      className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
                        ov === false
                          ? 'bg-danger text-white'
                          : 'bg-white border border-border text-ink-soft hover:bg-gray-50'
                      }`}
                      title="Refuser pour cet utilisateur"
                    >
                      ✗
                    </button>
                    <button
                      type="button"
                      onClick={() => void apply(p, null)}
                      disabled={isBusy}
                      className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
                        ov === null
                          ? 'bg-gray-200 text-ink'
                          : 'bg-white border border-border text-ink-soft hover:bg-gray-50'
                      }`}
                      title="Hérite du rôle"
                    >
                      Défaut
                    </button>
                    <button
                      type="button"
                      onClick={() => void apply(p, ov === true ? null : true)}
                      disabled={isBusy}
                      className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
                        ov === true
                          ? 'bg-success text-white'
                          : 'bg-white border border-border text-ink-soft hover:bg-gray-50'
                      }`}
                      title="Accorder à cet utilisateur"
                    >
                      ✓
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
