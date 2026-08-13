'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBrand } from '@/components/BrandMark';
import { readDeviceId } from '@/lib/device';

interface User {
  id: string;
  full_name: string;
  role: string;
  has_pin: boolean;
  pin_required?: boolean;
  color?: string | null;
}

/**
 * Prénom seul : la liste sert à SE reconnaître, entre collègues qui se
 * tutoient. « Marie Lefèvre · Responsable » est l'identité administrative
 * d'un compte, pas la façon dont on se désigne dans un magasin.
 */
function firstName(fullName: string): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || fullName || '—';
}

// Couleur d'un avatar : celle choisie au compte (users.color) sinon un repli
// stable dérivé du nom, pour qu'un même utilisateur garde toujours la sienne.
const USER_COLORS = ['#F4A09B', '#7AD09A', '#F0C25A', '#8FD5DA', '#C58EC2', '#9DB4F0', '#F39A6A'];
function userColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length] ?? USER_COLORS[0]!;
}

/**
 * Longueur du code PIN. Le serveur n'accepte que 4 chiffres (`/^\d{4}$/`) : les
 * pastilles suivent cette longueur, et la saisie se valide seule au 4e chiffre.
 */
const PIN_LENGTH = 4;

/** Or de la marque, lisible sur le vert profond du fond. */
const GOLD = '#FFEFB3';
/** Or un cran plus soutenu, pour les traits et bordures sur fond sombre. */
const GOLD_LINE = '#E9C46A';

export default function PinLogin({ onEmailLogin }: { onEmailLogin?: () => void }) {
  const router = useRouter();
  const brand = useBrand();
  const APP_NAME = brand.brand_name || 'HelloPos';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState<{ email: string; pin: string } | null>(null);
  const [migrationRequired, setMigrationRequired] = useState<string | null>(null);
  const [tenantRequired, setTenantRequired] = useState(false);

  async function loadUsers() {
    // On transmet le device_id du poste (localStorage) : le serveur
    // resout la boutique liee a cette caisse et ne renvoie que les
    // utilisateurs rattaches a cette boutique.
    let deviceQuery = '';
    if (typeof window !== 'undefined') {
      const dev = readDeviceId();
      if (dev) deviceQuery = `?device_id=${encodeURIComponent(dev)}`;
    }
    const r = await fetch(`/api/users/select${deviceQuery}`);
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
        setError(prettyError(j.error, j.message));
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
      else next = cur.length < PIN_LENGTH ? cur + key : cur;
      if (next.length === PIN_LENGTH) {
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

  const emailButton = onEmailLogin ? (
    <button
      onClick={onEmailLogin}
      className="inline-flex items-center gap-2.5 rounded-xl border px-5 h-12 text-sm font-medium transition-colors"
      style={{ color: GOLD, borderColor: GOLD_LINE }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      Connexion par email
    </button>
  ) : null;

  return (
    <main
      className="min-h-screen w-full flex flex-col items-center overflow-y-auto px-4 py-8 pt-safe pb-safe"
      style={{ backgroundColor: 'var(--primary)' }}
    >
      {/* Bouton retour : sur l'écran de saisie du code seulement, en haut à
          gauche, cadre or comme sur la maquette. */}
      {selected && (
        <button
          onClick={() => { setSelectedId(null); setPin(''); setError(null); }}
          className="fixed left-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-xl border transition-colors hover:bg-white/5"
          style={{ borderColor: GOLD_LINE, color: GOLD }}
          aria-label="Retour à la liste des profils"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}

      <div className="flex-1 w-full flex flex-col items-center justify-center min-h-0">
        {/* En-tête commun : logo, « Connexion », et la consigne du moment. */}
        <header className="text-center mb-6">
          <div className="flex justify-center mb-3">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={APP_NAME} className="h-12 w-auto max-w-[180px] object-contain" />
            ) : (
              <span className="text-lg font-semibold tracking-tight" style={{ color: GOLD }}>{APP_NAME}</span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: GOLD }}>Connexion</h1>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD, opacity: 0.75 }}>
            {selected ? 'Entrez votre code' : 'Choisissez votre profil'}
          </p>
        </header>

        {/* Bandeau migration manquante éventuel */}
        {migrationRequired && !selected && (
          <div className="mb-4 w-full max-w-md rounded-2xl bg-warning/15 border border-warning/40 p-4 text-center">
            <div className="font-semibold text-warning">⚠ Migration manquante</div>
            <p className="mt-1 text-sm text-white/80">
              La connexion par PIN nécessite la migration{' '}
              <code className="text-xs bg-white/10 px-1 rounded">{migrationRequired}</code>.
            </p>
          </div>
        )}

        {/* La carte blanche : grille de profils, ou pavé de saisie. */}
        {!selected ? (
          <ProfileCard
            loading={loading}
            users={users}
            tenantRequired={tenantRequired}
            onPick={pickUser}
          />
        ) : (
          <PinCard
            user={selected}
            pin={pin}
            error={error}
            submitting={submitting}
            onPress={press}
          />
        )}

        {/* Création de boutique (essai) : uniquement quand ce poste n'a encore
            aucun utilisateur. */}
        {!selected && users.length === 0 && (
          <div className="mt-4 w-full max-w-md text-center space-y-2">
            <a
              href="/setup"
              className="inline-flex w-full items-center justify-center rounded-xl bg-white/10 h-12 text-base font-medium text-white hover:bg-white/15"
            >
              + Créer ma boutique (essai 14 jours)
            </a>
            {tenantRequired && (
              <p className="text-xs text-white/60">
                Aucun poste rattaché à cette caisse. Contactez votre administrateur.
              </p>
            )}
            {bootstrapResult && (
              <div className="rounded-xl bg-success/20 px-3 py-2 text-xs text-white text-center">
                ✓ Démo créée : <strong>{bootstrapResult.email}</strong> · PIN <strong>{bootstrapResult.pin}</strong>
              </div>
            )}
            {bootstrapping && <div className="text-xs text-white/60">Création…</div>}
          </div>
        )}
      </div>

      {/* Connexion par email : en pied de page, détachée de la carte, avec une
          marge basse pour ne pas coller au bord de l'écran. */}
      {emailButton && <footer className="shrink-0 pt-8 pb-10 flex justify-center">{emailButton}</footer>}
    </main>
  );

  async function pickUser(u: User) {
    setError(null);
    if (!u.pin_required) {
      // Connexion sans PIN : on transitionne tout de suite pour que la tuile
      // "disparaisse" en même temps qu'on lance le fetch.
      setTransitioning(true);
      try {
        const r = await fetch('/api/auth/no-pin-login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: u.id }),
        });
        if (r.ok) { window.location.assign('/caisse'); return; }
        const j = await r.json().catch(() => ({}));
        setError(prettyError(j.error) || j.message || 'Connexion impossible');
      } catch (e) {
        setError((e as Error).message || 'Réseau indisponible');
      }
      setTransitioning(false);
      return;
    }
    router.prefetch('/caisse');
    setSelectedId(u.id);
    setPin('');
  }
}

/** La carte de sélection : une grille d'avatars, prénom + trait or dessous. */
function ProfileCard({ loading, users, tenantRequired, onPick }: {
  loading: boolean;
  users: User[];
  tenantRequired: boolean;
  onPick: (u: User) => void;
}) {
  return (
    <div className="w-full max-w-3xl rounded-3xl bg-white p-6 sm:p-8 shadow-xl">
      {loading ? (
        <div className="py-12 text-center text-sm text-ink-soft">Chargement…</div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-soft">
          {tenantRequired
            ? <>Aucune boutique sur ce poste.<br />
                <span className="text-xs">Connectez-vous avec votre email ou créez une boutique.</span></>
            : 'Aucun utilisateur configuré.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-7 max-h-[58vh] overflow-y-auto">
          {users.map((u) => {
            const c = u.color || userColor(u.full_name);
            return (
              <button
                key={u.id}
                onClick={() => onPick(u)}
                className="group flex flex-col items-center gap-2 rounded-2xl p-2 transition-transform active:scale-95"
              >
                <span
                  className="grid h-16 w-16 place-items-center rounded-full text-white font-semibold text-2xl shadow-sm transition-transform group-hover:scale-105"
                  style={{ backgroundColor: c }}
                  aria-hidden="true"
                >
                  {(u.full_name?.[0] ?? '?').toUpperCase()}
                </span>
                <span className="font-semibold text-ink text-[15px] leading-tight text-center truncate max-w-[7rem]">
                  {firstName(u.full_name)}
                </span>
                {/* Le trait or sous le prénom, signature de la maquette. */}
                <span className="h-[3px] w-8 rounded-full" style={{ backgroundColor: '#E9C46A' }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** La carte de saisie : chip utilisateur, pastilles, pavé numérique. */
function PinCard({ user, pin, error, submitting, onPress }: {
  user: User;
  pin: string;
  error: string | null;
  submitting: boolean;
  onPress: (key: string) => void;
}) {
  const c = user.color || userColor(user.full_name);
  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-xl">
      {/* Rappel du profil choisi, en haut à gauche. */}
      <div className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-full text-white font-semibold text-sm shrink-0"
          style={{ backgroundColor: c }}
          aria-hidden="true"
        >
          {(user.full_name?.[0] ?? '?').toUpperCase()}
        </span>
        <span className="font-semibold text-ink">{firstName(user.full_name)}</span>
      </div>

      {/* Pastilles : rempli = couleur du profil, curseur = cercle ouvert,
          à venir = point gris clair. */}
      <div className="mt-6 flex items-center justify-center gap-4">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          if (i < pin.length) {
            return <span key={i} className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />;
          }
          if (i === pin.length) {
            return <span key={i} className="h-5 w-5 rounded-full border-2" style={{ borderColor: c }} />;
          }
          return <span key={i} className="h-3 w-3 rounded-full bg-gray-300" />;
        })}
      </div>

      {error && <div className="mt-4 text-center text-sm text-danger">{error}</div>}

      {/* Pavé : 1 2 3 / 4 5 6 / 7 8 9 / (vide) 0 ⌫. */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9'].map((k) => (
          <PinKey key={k} label={k} onPress={() => onPress(k)} disabled={submitting} />
        ))}
        <span />
        <PinKey label="0" onPress={() => onPress('0')} disabled={submitting} />
        <PinKey label="⌫" ariaLabel="Effacer" onPress={() => onPress('⌫')} disabled={submitting}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 5H8.5a2 2 0 0 0-1.5.7L2.7 11a1.5 1.5 0 0 0 0 2l4.3 5.3a2 2 0 0 0 1.5.7H21a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
            <path d="m12 9 4 4m0-4-4 4" />
          </svg>
        </PinKey>
      </div>
    </div>
  );
}

function PinKey({ label, onPress, disabled, ariaLabel, children }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className="h-16 sm:h-[72px] rounded-2xl bg-gray-100 text-ink hover:bg-gray-200 active:scale-95 transition disabled:opacity-40 grid place-items-center text-2xl sm:text-[28px] font-medium"
    >
      {children ?? label}
    </button>
  );
}

function prettyError(code?: string, message?: string): string {
  switch (code) {
    case 'INVALID_PIN': return 'Code incorrect. Réessayez.';
    case 'ACCOUNT_LOCKED': return 'Compte verrouillé temporairement.';
    case 'NO_PIN_SET': return 'Aucun code configuré pour cet utilisateur.';
    case 'DEVICE_LIMIT_REACHED': return message || 'Limite d\'appareils atteinte.';
    default: return message || 'Connexion impossible.';
  }
}
