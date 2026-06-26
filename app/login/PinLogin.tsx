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
  owner: 'Admin',
  manager: 'Responsable',
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
    <main className="h-screen overflow-hidden bg-white flex flex-col">
      {/* En-tête : nom de l'app */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-3 shrink-0">
        <div className="grid h-11 w-11 place-items-center rounded-2xl accent-bar text-white text-lg font-semibold">F</div>
        <div>
          <div className="text-xl font-semibold tracking-tight">{APP_NAME}</div>
          <div className="text-xs text-ink-soft">Connexion utilisateur</div>
        </div>
      </header>

      {/* Bandeau migration manquante éventuel */}
      {migrationRequired && (
        <div className="mx-6 mt-4 card p-4 bg-warning/10 border-warning/30 shrink-0">
          <div className="font-semibold text-warning">⚠ Migration manquante</div>
          <p className="mt-1 text-sm text-ink-soft">
            La connexion par PIN nécessite la migration <code className="text-xs bg-white px-1 rounded">{migrationRequired}</code>.
            Lancez :
          </p>
          <pre className="mt-2 text-xs bg-white border border-border rounded-lg px-3 py-2 overflow-auto">npm run db:migrate
npm run user:test</pre>
        </div>
      )}

      {/* Zone centrale : clavier centré */}
      <div className="flex-1 grid place-items-center px-6 py-4 min-h-0">
        <div className="w-full max-w-md flex flex-col items-center">
          <div className="text-xs uppercase tracking-widest text-ink-soft">Code de connexion</div>
          <div className="mt-2 text-lg font-medium text-center min-h-[1.5rem]">
            {selected ? selected.full_name : 'Choisissez un profil ci-dessous'}
          </div>

          {/* Pastilles PIN */}
          <div className="mt-6 flex justify-center gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-5 w-5 rounded-full border-2 transition-colors"
                style={pin.length > i
                  ? { backgroundColor: 'var(--primary)', borderColor: 'transparent' }
                  : { borderColor: 'var(--border)' }}
              />
            ))}
          </div>

          {error && <div className="mt-4 text-center text-sm text-danger">{error}</div>}

          {/* Pavé numérique +20% : touches h-20 (vs h-16), text-3xl, gap-4 */}
          <div className="mt-8 grid grid-cols-3 gap-4 w-full">
            {['1','2','3','4','5','6','7','8','9'].map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                disabled={!selectedId || submitting}
                className="h-20 rounded-2xl border border-border bg-white text-3xl font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
              >
                {k}
              </button>
            ))}
            <button
              onClick={() => press('C')}
              disabled={!selectedId || submitting}
              className="h-20 rounded-2xl border border-border bg-white text-base font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
            >
              C
            </button>
            <button
              onClick={() => press('0')}
              disabled={!selectedId || submitting}
              className="h-20 rounded-2xl border border-border bg-white text-3xl font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
            >
              0
            </button>
            <button
              onClick={() => press('⌫')}
              disabled={!selectedId || submitting}
              className="h-20 rounded-2xl border border-border bg-white text-2xl font-medium hover:bg-gray-50 active:scale-95 transition disabled:opacity-40"
            >
              ⌫
            </button>
          </div>
        </div>
      </div>

      {/* Bandeau bas : liste users */}
      <footer className="border-t border-border bg-gray-50 px-6 py-4 shrink-0">
        {loading ? (
          <div className="text-center text-sm text-ink-soft">Chargement…</div>
        ) : users.length === 0 ? (
          <div className="max-w-md mx-auto">
            {bootstrapResult ? (
              <div className="rounded-xl bg-success/10 px-3 py-3 text-sm text-success text-center">
                ✓ Compte créé : <strong>{bootstrapResult.email}</strong> · PIN : <strong>{bootstrapResult.pin}</strong>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Aucun utilisateur configuré</div>
                  <p className="text-xs text-ink-soft mt-0.5">Créez un compte administrateur pour démarrer.</p>
                </div>
                <button onClick={() => void bootstrap()} disabled={bootstrapping} className="btn-primary text-sm">
                  {bootstrapping ? 'Création…' : 'Créer admin'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {users.map((u) => {
              const initials = u.full_name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              const isSelected = u.id === selectedId;
              return (
                <button
                  key={u.id}
                  onClick={() => { setSelectedId(u.id); setPin(''); setError(null); }}
                  className={`shrink-0 rounded-xl border bg-white px-4 py-2.5 flex items-center gap-3 hover:shadow-md transition ${
                    isSelected ? 'ring-2 ring-offset-1 border-transparent' : 'border-border'
                  }`}
                  style={isSelected ? { ['--tw-ring-color' as string]: 'var(--primary)' } : undefined}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full accent-bar text-white text-sm font-semibold">
                    {initials}
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm whitespace-nowrap">{u.full_name}</div>
                    <div className="text-[11px] text-ink-soft">
                      {ROLE_LABELS[u.role] ?? u.role}
                      {!u.has_pin && <span className="text-warning ml-1">· sans PIN</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </footer>
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
