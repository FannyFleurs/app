'use client';

import { useState } from 'react';

/**
 * Écran de connexion email + mot de passe, partagé par TOUTES les pages de
 * connexion (caisse — 1ʳᵉ connexion, back-office, admin, CA) pour un rendu
 * strictement identique. Le logo est fourni par le serveur (SSR) : il
 * s'affiche immédiatement, sans flash de monogramme.
 */
export default function AuthForm({
  logoUrl, brandName, title, subtitle, submitLabel, redirectTo, footer,
}: {
  logoUrl: string;
  brandName: string;
  title: string;
  subtitle: string;
  submitLabel: string;
  redirectTo: string;
  footer?: React.ReactNode;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(prettyError(j.error, j.message));
        return;
      }
      window.location.assign(redirectTo);
    } catch {
      setErr('Réseau indisponible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 bg-bg pt-safe pb-safe">
      <div className="w-full max-w-md">
        <form onSubmit={submit} className="card p-8 space-y-5">
          <div className="text-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={brandName} className="mx-auto h-16 w-auto max-w-[220px] object-contain" />
            ) : (
              <div className="text-2xl font-semibold tracking-tight">{brandName}</div>
            )}
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-soft">Email</label>
            <input
              autoFocus type="email" autoComplete="username"
              className="input mt-1 h-12 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@boutique.fr"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-ink-soft">Mot de passe</label>
            <input
              type="password" autoComplete="current-password"
              className="input mt-1 h-12 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {err && (
            <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="btn-primary w-full h-12 text-base font-semibold"
          >
            {busy ? 'Connexion…' : submitLabel}
          </button>
        </form>

        {footer && <div className="mt-4 text-center text-sm text-ink-soft">{footer}</div>}
      </div>
    </main>
  );
}

function prettyError(code?: string, message?: string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS': return 'Email ou mot de passe incorrect.';
    case 'ACCOUNT_LOCKED': return 'Compte verrouillé temporairement. Réessayez plus tard.';
    case 'NO_PASSWORD_SET': return 'Aucun mot de passe défini pour ce compte. Contactez un administrateur.';
    case 'DEVICE_LIMIT_REACHED': return message || 'Limite d\'appareils atteinte.';
    default: return message || 'Connexion impossible.';
  }
}
