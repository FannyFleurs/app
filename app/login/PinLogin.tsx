'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  full_name: string;
  role: string;
  has_pin: boolean;
}

const APP_NAME = 'Florea POS'; // Nom temporaire, à changer

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Propriétaire',
  manager: 'Manager',
  vendeur: 'Vendeur',
  comptable: 'Comptable',
  lecture_seule: 'Lecture seule',
  support_technique: 'Support',
};

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

  async function loadUsers() {
    const r = await fetch('/api/users/select');
    if (r.ok) {
      const j = await r.json();
      setUsers(j.users);
      setMigrationRequired(j.migration_required ?? null);
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
        // soumission automatique
        void submit(selectedId, next);
      }
      return next;
    });
  }

  // Clavier physique
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
    <main className="h-screen overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_440px] bg-white">
      {/* Colonne gauche : tuiles utilisateurs */}
      <div className="flex flex-col p-8 overflow-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl accent-bar text-white text-lg font-semibold">F</div>
          <div>
            <div className="text-xl font-semibold tracking-tight">{APP_NAME}</div>
            <div className="text-xs text-ink-soft">Sélectionnez votre profil</div>
          </div>
        </div>

        {migrationRequired && (
          <div className="card p-4 max-w-2xl mb-4 bg-warning/10 border-warning/30">
            <div className="font-semibold text-warning">⚠ Migration manquante</div>
            <p className="mt-1 text-sm text-ink-soft">
              La connexion par PIN nécessite la migration <code className="text-xs bg-white px-1 rounded">{migrationRequired}</code>.
              Lancez dans votre terminal :
            </p>
            <pre className="mt-2 text-xs bg-white border border-border rounded-lg px-3 py-2 overflow-auto">npm run db:migrate
npm run user:test</pre>
            <p className="mt-2 text-xs text-ink-soft">
              Le premier ajoute la colonne PIN, le second attribue le PIN <strong>1234</strong> à vos utilisateurs existants.
            </p>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-ink-soft">Chargement…</div>
        ) : users.length === 0 ? (
          <div className="card p-6 max-w-md">
            <div className="font-semibold">Aucun utilisateur</div>
            <p className="mt-2 text-sm text-ink-soft">
              Aucun compte n&apos;est configuré dans la base. Pour démarrer rapidement,
              vous pouvez créer un compte administrateur par défaut.
            </p>
            {bootstrapResult ? (
              <div className="mt-4 rounded-xl bg-success/10 px-3 py-3 text-sm text-success">
                ✓ Compte créé : <strong>{bootstrapResult.email}</strong><br />
                PIN : <strong>{bootstrapResult.pin}</strong>
                <p className="mt-2 text-xs text-ink-soft">
                  Sélectionnez la tuile ci-dessus, saisissez le PIN puis modifiez-le
                  ensuite dans Paramètres → Gestion utilisateurs.
                </p>
              </div>
            ) : (
              <button
                onClick={() => void bootstrap()}
                disabled={bootstrapping}
                className="btn-primary mt-4 w-full"
              >
                {bootstrapping ? 'Création…' : 'Créer un compte administrateur'}
              </button>
            )}
            {error && (
              <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
            {users.map((u) => {
              const initials = u.full_name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              const isSelected = u.id === selectedId;
              return (
                <button
                  key={u.id}
                  onClick={() => { setSelectedId(u.id); setPin(''); setError(null); }}
                  className={`card p-4 text-left transition-all hover:shadow-md ${
                    isSelected ? 'ring-2 ring-offset-2' : ''
                  }`}
                  style={isSelected ? { ['--tw-ring-color' as string]: 'var(--primary)' } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full accent-bar text-white text-sm font-semibold">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.full_name}</div>
                      <div className="text-xs text-ink-soft">{ROLE_LABELS[u.role] ?? u.role}</div>
                    </div>
                  </div>
                  {!u.has_pin && (
                    <div className="mt-2 text-[11px] text-warning">⚠ Aucun code configuré</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Colonne droite : pavé PIN */}
      <div className="border-l border-border bg-gray-50 flex flex-col p-8 overflow-auto">
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-ink-soft">Code de connexion</div>
          <div className="mt-2 text-lg font-medium">
            {selected ? selected.full_name : 'Choisissez un profil'}
          </div>
        </div>

        {/* Pastilles PIN */}
        <div className="mt-8 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-colors ${
                pin.length > i
                  ? 'border-transparent'
                  : 'border-border bg-transparent'
              }`}
              style={pin.length > i ? { backgroundColor: 'var(--primary)' } : undefined}
            />
          ))}
        </div>

        {error && (
          <div className="mt-4 text-center text-sm text-danger">{error}</div>
        )}

        {/* Pavé numérique */}
        <div className="mt-8 grid grid-cols-3 gap-3 max-w-xs mx-auto w-full">
          {['1','2','3','4','5','6','7','8','9'].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              disabled={!selectedId || submitting}
              className="h-16 rounded-2xl border border-border bg-white text-2xl font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
            >
              {k}
            </button>
          ))}
          <button
            onClick={() => press('C')}
            disabled={!selectedId || submitting}
            className="h-16 rounded-2xl border border-border bg-white text-sm font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
          >
            C
          </button>
          <button
            onClick={() => press('0')}
            disabled={!selectedId || submitting}
            className="h-16 rounded-2xl border border-border bg-white text-2xl font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
          >
            0
          </button>
          <button
            onClick={() => press('⌫')}
            disabled={!selectedId || submitting}
            className="h-16 rounded-2xl border border-border bg-white text-xl font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
          >
            ⌫
          </button>
        </div>

        <div className="mt-auto pt-6 text-center text-xs text-ink-soft">
          Système conforme aux exigences d&apos;inaltérabilité (art. 286, I, 3°bis CGI).
        </div>
      </div>
    </main>
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
