'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  full_name: string;
  role: string;
  has_pin: boolean;
  pin_required?: boolean;
  color?: string | null;
}

const APP_NAME = 'Webpos';

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
    // Prefetch /caisse des le montage du login : quand la connexion
    // reussira, la navigation sera quasi-instantanee (chunks JS deja
    // charges, layout compile).
    router.prefetch('/caisse');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Etat de transition post-connexion : on masque le login pour laisser
  // apparaitre la caisse "au travers" quasi-immediatement.
  const [transitioning, setTransitioning] = useState(false);

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

  async function submit(forUser: string, pinValue: string) {
    setSubmitting(true); setError(null);
    try {
      const r = await fetch('/api/auth/pin-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: forUser, pin: pinValue }),
      });
      if (!r.ok) {
        setSubmitting(false);
        const j = await r.json().catch(() => ({}));
        setError(prettyError(j.error));
        setPin('');
        return;
      }
      // Succes : overlay immediat + navigation "dure" (window.location)
      // qui garantit une reprise 100% propre — plus fiable que
      // router.push apres un cycle logout/login, ou apres un service
      // worker mis a jour.
      setTransitioning(true);
      window.location.assign('/caisse');
    } catch (e) {
      setSubmitting(false);
      setError((e as Error).message || 'Réseau indisponible');
      setPin('');
    }
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

  // En transition : on masque completement l'ecran de login (fade tres
  // court) pour que la caisse dessous apparaisse quasi-instantanement.
  if (transitioning) {
    return (
      <main
        className="fixed inset-0 z-[200] bg-white grid place-items-center pointer-events-none"
        style={{ animation: 'fadeIn 90ms ease-out reverse forwards' }}
        aria-hidden="true"
      />
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-white grid grid-cols-1 lg:grid-cols-[520px_1fr] pt-safe pb-safe pl-safe pr-safe">
      {/* COLONNE GAUCHE — sélection utilisateur. Sur mobile, on masque la
          liste quand un user est sélectionné, pour laisser place au PIN. */}
      <aside className={`${selected ? 'hidden lg:flex' : 'flex'} flex-col border-r border-border bg-white overflow-hidden`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center gap-3 shrink-0">
          <div className="grid h-11 w-11 place-items-center rounded-2xl accent-bar text-white text-lg font-semibold">F</div>
          <div>
            <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
            <div className="text-xs text-ink-soft">Connexion utilisateur</div>
          </div>
        </div>

        {/* Liste users (scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {loading ? (
            <div className="text-center text-sm text-ink-soft py-6">Chargement…</div>
          ) : users.length === 0 ? (
            <div className="text-center text-sm text-ink-soft py-6">
              {tenantRequired
                ? <>
                    Aucune boutique sur ce poste.<br />
                    <span className="text-xs">
                      Connectez-vous avec votre email ou créez une boutique.
                    </span>
                  </>
                : 'Aucun utilisateur configuré.'}
            </div>
          ) : (
            users.map((u) => {
              const isSelected = u.id === selectedId;
              // Priorite : couleur choisie manuellement (users.color) ;
              // sinon fallback deterministe base sur le nom.
              const c = u.color || userColor(u.full_name);
              return (
                <button
                  key={u.id}
                  onClick={async () => {
                    setError(null);
                    if (!u.pin_required) {
                      // Connexion sans PIN — on transitionne tout de suite
                      // pour que la tuile "disparaisse" en meme temps
                      // qu'on lance le fetch.
                      setTransitioning(true);
                      try {
                        const r = await fetch('/api/auth/no-pin-login', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ user_id: u.id }),
                        });
                        if (r.ok) {
                          // window.location.assign = navigation "dure"
                          // qui force le browser a recharger la page :
                          // le cookie de session est bien pris en compte
                          // et on repart d'un state React totalement propre.
                          // C'est un peu plus lent que router.push mais
                          // 100% fiable, notamment apres un logout+login.
                          window.location.assign('/caisse');
                          return;
                        }
                        const j = await r.json().catch(() => ({}));
                        setError(prettyError(j.error) || j.message || 'Connexion impossible');
                      } catch (e) {
                        setError((e as Error).message || 'Réseau indisponible');
                      }
                      setTransitioning(false);
                      return;
                    }
                    // Prefetch anticipe : selection d'un user = intention
                    // de connexion imminente.
                    router.prefetch('/caisse');
                    setSelectedId(u.id);
                    setPin('');
                  }}
                  className={`relative w-full text-left rounded-2xl border bg-white px-5 py-5 lg:py-6 pl-6 transition-all flex items-center gap-4 ${
                    isSelected
                      ? 'border-transparent ring-2 shadow-md'
                      : 'border-border hover:shadow-sm hover:border-gray-300'
                  }`}
                  style={isSelected ? { ['--tw-ring-color' as string]: 'var(--primary)' } : undefined}
                >
                  <span
                    className="absolute left-0 top-2.5 bottom-2.5 w-2 rounded-r-full"
                    style={{ backgroundColor: c }}
                  />
                  <div
                    className="grid h-12 w-12 lg:h-14 lg:w-14 place-items-center rounded-full text-white font-semibold text-lg lg:text-xl shrink-0"
                    style={{ backgroundColor: c }}
                    aria-hidden="true"
                  >
                    {(u.full_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-lg lg:text-xl truncate leading-tight">{u.full_name}</div>
                    <div className="text-sm text-ink-soft mt-0.5">
                      {ROLE_LABELS[u.role] ?? u.role}
                      {!u.has_pin && <span className="text-warning ml-1">· sans PIN</span>}
                    </div>
                  </div>
                  {isSelected && (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-deep shrink-0">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Bouton bas — Accès / Inscription. "+ Créer ma boutique" n'apparaît
            que si aucun utilisateur n'est encore configuré sur ce poste. */}
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
          {users.length === 0 && (
            <a
              href="/setup"
              className="btn-ghost w-full h-10 text-sm text-center inline-flex items-center justify-center"
            >
              + Créer ma boutique (essai 14 jours)
            </a>
          )}
          {bootstrapResult && (
            <div className="rounded-xl bg-success/10 px-3 py-2 text-xs text-success text-center">
              ✓ Démo créée : <strong>{bootstrapResult.email}</strong> · PIN <strong>{bootstrapResult.pin}</strong>
            </div>
          )}
        </div>
      </aside>

      {/* COLONNE DROITE — affichage / pavé PIN. Sur mobile, visible
          uniquement quand un user est sélectionné. */}
      <section className={`${selected ? 'flex' : 'hidden lg:flex'} flex-col overflow-hidden`}>
        {/* En-tête à droite : juste le bouton retour mobile (le logo
            de gauche dans l'aside suffit, pas besoin de le doubler). */}
        {selected && (
          <div className="px-4 py-4 flex items-center shrink-0 lg:hidden">
            <button
              onClick={() => { setSelectedId(null); setPin(''); setError(null); }}
              className="btn-ghost text-sm"
              aria-label="Retour à la liste des utilisateurs"
            >
              ← Retour
            </button>
          </div>
        )}

        {/* Bandeau migration manquante éventuel */}
        {migrationRequired && (
          <div className="mx-4 lg:mx-8 card p-4 bg-warning/10 border-warning/30 shrink-0">
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
        <div className="flex-1 grid place-items-center px-4 lg:px-8 pb-4 lg:pb-10 min-h-0">
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
      className={`h-16 lg:h-[88px] rounded-2xl border border-border bg-white hover:bg-gray-50 active:scale-95 transition disabled:opacity-40 ${
        small ? 'text-lg lg:text-2xl' : 'text-2xl lg:text-4xl'
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
