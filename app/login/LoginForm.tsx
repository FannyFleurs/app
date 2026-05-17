'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'ERROR' }));
        setError(prettyError(j.error));
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-ink-soft">Email</label>
        <input
          type="email"
          autoComplete="username"
          required
          className="input mt-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@boutique.fr"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-ink-soft">Mot de passe</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          className="input mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}

function prettyError(code: string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS': return 'Email ou mot de passe incorrect.';
    case 'ACCOUNT_LOCKED': return 'Compte verrouillé temporairement. Réessayez plus tard.';
    default: return 'Connexion impossible.';
  }
}
