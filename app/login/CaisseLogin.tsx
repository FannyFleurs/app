'use client';

import { useEffect, useState } from 'react';
import PinLogin from './PinLogin';
import { useBrand } from '@/components/BrandMark';

/**
 * Écran de connexion caisse. La connexion EMAIL n'est nécessaire qu'à la
 * PREMIÈRE connexion sur un poste (pour rattacher la boutique). Une fois
 * la boutique connue sur cet appareil (cookie tenant), on affiche
 * directement la connexion par PIN. Un lien discret permet de basculer
 * manuellement d'un mode à l'autre.
 */
export default function CaisseLogin() {
  const brand = useBrand();
  const APP_NAME = brand.brand_name || 'HelloPos';
  const [mode, setMode] = useState<'email' | 'pin' | 'loading'>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  // Décide du mode initial : PIN si la boutique est déjà rattachée à ce
  // poste (des utilisateurs remontent), sinon email (première connexion).
  useEffect(() => {
    void (async () => {
      try {
        let q = '';
        if (typeof window !== 'undefined') {
          const dev = localStorage.getItem('webpos_device_id');
          if (dev) q = `?device_id=${encodeURIComponent(dev)}`;
        }
        const r = await fetch(`/api/users/select${q}`);
        const j = r.ok ? await r.json() : {};
        if (!j.tenant_required && Array.isArray(j.users) && j.users.length > 0) {
          setMode('pin');
        } else {
          setMode('email');
        }
      } catch {
        setMode('email');
      }
    })();
  }, []);

  if (mode === 'loading') {
    return <main className="min-h-screen grid place-items-center bg-gray-50 text-sm text-ink-soft">Chargement…</main>;
  }

  if (mode === 'pin') {
    return (
      <div className="relative">
        <PinLogin />
        <button
          onClick={() => setMode('email')}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 text-sm text-ink-soft hover:text-ink underline"
        >
          Connexion par email
        </button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(prettyError(j.error, j.message));
        return;
      }
      // Navigation "dure" : le cookie de session est pris en compte et
      // le routage par défaut envoie vers la caisse.
      window.location.assign('/caisse');
    } catch {
      setError('Impossible de joindre le serveur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 px-4 pt-safe pb-safe">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt={APP_NAME} className="h-14 w-14 rounded-2xl object-contain mb-3" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl font-semibold mb-3">
              {APP_NAME.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-ink-soft">Connexion à la caisse</p>
        </div>

        <form onSubmit={onSubmit} className="card p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-soft">Email</label>
            <input
              type="email" autoComplete="username" required autoFocus
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@votre-boutique.fr"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Mot de passe</label>
            <input
              type="password" autoComplete="current-password" required
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full h-11">
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          <button
            type="button"
            onClick={() => setForgot((v) => !v)}
            className="w-full text-center text-xs text-ink-soft hover:text-ink underline"
          >
            Mot de passe oublié ?
          </button>
          {forgot && (
            <div className="rounded-xl bg-gray-50 border border-border px-3 py-2 text-xs text-ink-soft">
              Contactez votre administrateur : il peut réinitialiser votre mot
              de passe depuis les paramètres (Gestion des utilisateurs). En
              caisse, la connexion rapide se fait par code PIN.
            </div>
          )}
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setMode('pin')}
            className="text-sm text-ink-soft hover:text-ink underline"
          >
            Connexion par code PIN
          </button>
        </div>
      </div>
    </main>
  );
}

function prettyError(code?: string, message?: string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS': return 'Email ou mot de passe incorrect.';
    case 'ACCOUNT_LOCKED': return 'Compte verrouillé temporairement. Réessayez plus tard.';
    case 'NO_PASSWORD_SET': return 'Aucun mot de passe défini pour ce compte. Contactez un administrateur.';
    // Le serveur fournit un message explicite (limite d'appareils…) : on
    // l'affiche tel quel plutôt qu'un générique peu utile.
    case 'DEVICE_LIMIT_REACHED': return message || 'Limite d\'appareils atteinte.';
    default: return message || 'Connexion impossible.';
  }
}
