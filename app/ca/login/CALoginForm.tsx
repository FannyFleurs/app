'use client';

import { useState } from 'react';

/**
 * Connexion email + mot de passe — reutilise /api/auth/login qui gere
 * la creation de session cookie webpos_session. Une fois connecte, on
 * bascule sur /ca (dashboard).
 */
export default function CALoginForm() {
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
        setErr(j.error ?? j.message ?? 'Connexion impossible');
        return;
      }
      window.location.assign('/');
    } catch (e) {
      setErr((e as Error).message || 'Réseau indisponible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 bg-bg">
      <form
        onSubmit={submit}
        className="card w-full max-w-md p-8 space-y-5"
      >
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl font-semibold">
            €
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Chiffre d&apos;affaires</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Connectez-vous avec votre email et votre mot de passe.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-ink-soft">Email</label>
          <input
            autoFocus
            type="email"
            className="input mt-1 h-12 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink-soft">Mot de passe</label>
          <input
            type="password"
            className="input mt-1 h-12 text-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
