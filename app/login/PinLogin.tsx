'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  full_name: string;
  role: string;
  has_pin: boolean;
  pin_required?: boolean;
}

const APP_NAME = 'Florea POS';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Admin',
  manager: 'Responsable',
  vendeur: 'Vendeur',
  comptable: 'Comptable',
  lecture_seule: 'Lecture seule',
  support_technique: 'Support',
};

// Palette pour les barres verticales colorées à gauche de chaque tuile utilisateur.
// Hash stable du nom → couleur, pour qu'un même utilisateur garde toujours sa couleur.
const USER_COLORS = ['#F4A09B', '#7AD09A', '#F0C25A', '#8FD5DA', '#C58EC2', '#9DB4F0', '#F39A6A'];
function userColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length] ?? USER_COLORS[0]!;
}

export default function PinLogin() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState<{ email: string; pin: string } | null>(null);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [tenantRequired, setTenantRequired] = useState(false);

  async function loadUsers() {
    const r = await fetch('/api/users/select');
    if (r.ok) {
      const j = await r.json();
      setUsers(j.users);
      setMigrationRequired(j.migration_required ?? null);
      setTenantRequired(!!j.tenant_required);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadUsers();
      setLoading(false);
    })();
  }, []);

  async function bootstrap() {
    setBootstrapping(true);
    const r = await fetch('/api/auth/bootstrap', { method: 'POST' });
    setBootstrapping(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    setBootstrapResult(j);
    await loadUsers();
  }

  const selected = useMemo(
    () => users.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) =>
      u.full_name.toLowerCase().includes(needle) ||
      ROLE_LABELS[u.role]?.toLowerCase().includes(needle),
    );
  }, [users, search]);

  async function submit(forUser: string, pinValue: string) {
    setSubmitting(true); setError(null);
    const r = await fetch('/api/auth/pin-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: forUser, pin: pinValue }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(prettyError(j.error));
      setPin('');
      return;
    }
    router.push('/');
    router.refresh();
  }

  function press(key: string) {
    if (!selectedId) return;
    setError(null);
    setPin((cur) => {
      let next = cur;
      if (key === 'C') next = '';
      else if (key === '⌫') next = cur.slice(0, -1);
      else next = cur.length < 4 ? cur + key : cur;
      if (next.length === 4) {
        void submit(selectedId, next);
      }
      return next;
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      if (e.key >= '0' && e.key <= '9') { press(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('⌫'); e.preventDefault(); }
      else if (e.key === 'Escape') { setSelectedId(null); setPin(''); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <main className="h-screen overflow-hidden bg-white grid grid-cols-1 lg:grid-cols-[440px_1fr]">
      {/* COLONNE GAUCHE — sélection utilisateur */}
      <aside className="flex flex-col border-r border-border bg-white overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center gap-3 shrink-0">
          <div className="grid h-11 w-11 place-items-center rounded-2xl accent-bar text-white text-lg font-semibold">F</div>
          <div>
            <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
            <div className="text-xs text-ink-soft">Connexion utilisateur</div>
          </div>
        </div>

        {/* Recherche */}
        <div className="p-4 shrink-0">
          <div className="relative">
            <input
              className="input h-12 pr-10 text-base"
              placeholder="Rechercher"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
          </div>
        </div>

        {/* Liste users */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {loading ? (
            <div className="text-center text-sm text-ink-soft py-6">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-ink-soft py-6">
              {tenantRequired
                ? <>
                    Aucune boutique sur ce poste.<br />
                    <span className="text-xs">
                      Connectez-vous avec votre email ou créez une boutique.
                    </span>
                  </>
                : users.length === 0 ? 'Aucun utilisateur configuré.' : 'Aucun résultat.'}
            </div>
          ) : (
            filtered.map((u) => {
              const isSelected = u.id === selectedId;
              const c = userColor(u.full_name);
              return (
                <button
                  key={u.id}
                  onClick={async () => {
                    setError(null);
                    if (!u.pin_required) {
                      // Connexion sans PIN explicitement autorisée
                      const r = await fetch('/api/auth/no-pin-login', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: u.id }),
                      });
                      if (r.ok) { router.push('/'); router.refresh(); return; }
                    }
                    setSelectedId(u.id);
                    setPin('');
                  }}
                  className={`relative w-full text-left rounded-xl border bg-white px-4 py-3 pl-5 transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'border-transparent ring-2 shadow-md'
                      : 'border-border hover:shadow-sm hover:border-gray-300'
                  }`}
                  style={isSelected ? { ['--tw-ring-color' as string]: 'var(--primary)' } : undefined}
                >
                  <span
                    className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full"
                    style={{ backgroundColor: c }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{u.full_name}</div>
                    <div className="text-[11px] text-ink-soft">
                      {ROLE_LABELS[u.role] ?? u.role}
                      {!u.has_pin && <span className="text-warning ml-1">· sans PIN</span>}
                    </div>
                  </div>
                  {isSelected && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-deep">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Bouton bas — Accès / Inscription */}
        <div className="border-t border-border p-4 shrink-0 bg-white space-y-2">
          <button
            onClick={() => setShowAdminLogin(true)}
            className="btn-primary w-full h-12 text-base"
          >
            <span className="inline-flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="7" r="4" />
                <path d="M16 11l2 2 4-4" />
                <path d="M2 21v-1a7 7 0 0 1 14 0v1" />
              </svg>
              {tenantRequired ? 'Me connecter (email)' : 'Accès admin et autres'}
            </span>
          </button>
          <a
            href="/setup"
            className="btn-ghost w-full h-10 text-sm text-center inline-flex items-center justify-center"
          >
            + Créer ma boutique (essai 14 jours)
          </a>
          {bootstrapResult && (
            <div className="rounded-xl bg-success/10 px-3 py-2 text-xs text-success text-center">
              ✓ Démo créée : <strong>{bootstrapResult.email}</strong> · PIN <strong>{bootstrapResult.pin}</strong>
            </div>
          )}
        </div>
      </aside>

      {/* COLONNE DROITE — affichage / pavé PIN */}
      <section className="flex flex-col overflow-hidden">
        {/* En-tête à droite : logo */}
        <div className="px-8 py-6 flex items-center justify-end shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">F</div>
            <span className="font-semibold tracking-tight text-ink">{APP_NAME}</span>
          </div>
        </div>

        {/* Bandeau migration manquante éventuel */}
        {migrationRequired && (
          <div className="mx-8 card p-4 bg-warning/10 border-warning/30 shrink-0">
            <div className="font-semibold text-warning">⚠ Migration manquante</div>
            <p className="mt-1 text-sm text-ink-soft">
              La connexion par PIN nécessite la migration{' '}
              <code className="text-xs bg-white px-1 rounded">{migrationRequired}</code>. Lancez :
            </p>
            <pre className="mt-2 text-xs bg-white border border-border rounded-lg px-3 py-2 overflow-auto">npm run db:migrate
npm run user:test</pre>
          </div>
        )}

        {/* Centre : illustration OU pavé PIN */}
        <div className="flex-1 grid place-items-center px-8 pb-10 min-h-0">
          {!selected ? (
            <div className="text-center">
              <div className="mx-auto grid h-48 w-48 place-items-center rounded-full bg-accent-soft text-accent-deep mb-6">
                {/* Illustration vectorielle simple : bouclier + clé */}
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
                  <path d="M60 14 L94 28 V60 C94 84 78 100 60 106 C42 100 26 84 26 60 V28 Z"
                        fill="white" stroke="currentColor" strokeWidth="3" />
                  <circle cx="55" cy="56" r="9" stroke="currentColor" strokeWidth="3" fill="none" />
                  <path d="M55 65 V83" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  <path d="M55 73 H70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  <path d="M55 79 H68" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Sélectionner un utilisateur</h1>
              <p className="mt-2 text-sm text-ink-soft">
                Choisissez votre profil à gauche pour saisir votre code.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-sm">
              <h1 className="text-2xl font-semibold tracking-tight text-center">Entrez votre code</h1>
              <div className="mt-1 text-sm text-ink-soft text-center">{selected.full_name}</div>

              {/* Pastilles PIN — 4 cases visuelles */}
              <div className="mt-6 grid grid-cols-4 gap-3 max-w-[260px] mx-auto">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg border-2 transition-colors grid place-items-center text-2xl"
                    style={pin.length > i
                      ? { backgroundColor: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary-deep)' }
                      : { borderColor: 'var(--border)' }}
                  >
                    {pin.length > i ? '●' : ''}
                  </div>
                ))}
              </div>

              {error && <div className="mt-4 text-center text-sm text-danger">{error}</div>}

              {/* Pavé : 7 8 9 / 4 5 6 / 1 2 3 / C 0 ⌫ */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                {['7','8','9','4','5','6','1','2','3'].map((k) => (
                  <PinKey key={k} label={k} onPress={() => press(k)} disabled={submitting} />
                ))}
                <PinKey label="C" onPress={() => press('C')} disabled={submitting} small />
                <PinKey label="0" onPress={() => press('0')} disabled={submitting} />
                <PinKey label="⌫" onPress={() => press('⌫')} disabled={submitting} small />
              </div>
            </div>
          )}
        </div>
      </section>

      {showAdminLogin && (
        <AdminLoginModal
          onClose={() => setShowAdminLogin(false)}
          onSuccess={() => { router.push('/'); router.refresh(); }}
        />
      )}
    </main>
  );
}

function AdminLoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? j.message ?? 'Connexion impossible');
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <form className="card max-w-sm w-full p-6" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Accès admin et autres</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <p className="text-sm text-ink-soft mb-3">
          Connectez-vous avec votre email et mot de passe pour accéder à l&apos;administration.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Email</label>
            <input className="input mt-1" type="email" autoFocus value={email}
                   onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Mot de passe</label>
            <input className="input mt-1" type="password" value={password}
                   onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        {err && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
        <button type="submit" disabled={busy || !email || !password}
                className="btn-primary w-full mt-4 h-11">
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}

function PinKey({ label, onPress, disabled, small }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`h-16 rounded-2xl border border-border bg-white hover:bg-gray-50 active:scale-95 transition disabled:opacity-40 ${
        small ? 'text-lg' : 'text-2xl'
      } font-medium`}
    >
      {label}
    </button>
  );
}

function prettyError(code?: string): string {
  switch (code) {
    case 'INVALID_PIN': return 'Code incorrect. Réessayez.';
    case 'ACCOUNT_LOCKED': return 'Compte verrouillé temporairement.';
    case 'NO_PIN_SET': return 'Aucun code configuré pour cet utilisateur.';
    default: return 'Connexion impossible.';
  }
}
