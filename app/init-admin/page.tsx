'use client';

import { useState } from 'react';

/**
 * Page de bootstrap pour créer le premier super_admin SaaS.
 *
 * Procédure :
 *   1. Configurer INIT_SECRET dans Vercel (Settings → Environment Variables).
 *   2. Redéployer pour que la variable soit prise en compte.
 *   3. Ouvrir cette page (https://<ton-app>.vercel.app/init-admin).
 *   4. Saisir email + mot de passe + le secret.
 *   5. Le super_admin est créé. La page refuse toute création ultérieure.
 */
export default function InitAdminPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [initSecret, setInitSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSuccess(null);
    const r = await fetch('/api/auth/init-super-admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        init_secret: initSecret,
      }),
    });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSuccess(j.message ?? 'Super admin créé.');
  }

  return (
    <main className="min-h-screen grid place-items-center bg-white p-4">
      <div className="card max-w-md w-full p-6">
        <h1 className="text-xl font-semibold tracking-tight">Bootstrap super-admin</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Crée le premier compte qui pourra gérer toutes les organisations
          clientes de Webpos. Cette page s&apos;auto-désactive une fois le
          compte créé.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Nom complet</label>
            <input
              className="input mt-1"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jonathan Dupont"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Email</label>
            <input
              type="email"
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@swebio.fr"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Mot de passe</label>
            <input
              type="password"
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="12 caractères minimum"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">
              Secret d&apos;initialisation
            </label>
            <input
              type="password"
              className="input mt-1"
              value={initSecret}
              onChange={(e) => setInitSecret(e.target.value)}
              placeholder="Valeur de INIT_SECRET définie sur Vercel"
            />
            <p className="text-[11px] text-ink-soft mt-1">
              Variable d&apos;environnement définie dans Vercel.
              Copie-colle exactement la valeur.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
              ✓ {success}
              <div className="mt-2">
                <a href="/login" className="underline font-medium">
                  Aller à la page de connexion →
                </a>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password || !fullName || !initSecret}
            className="btn-primary w-full h-11"
          >
            {busy ? 'Création…' : 'Créer le super-admin'}
          </button>
        </form>
      </div>
    </main>
  );
}
