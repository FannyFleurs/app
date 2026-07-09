'use client';

import { useState } from 'react';

/**
 * Écran de blocage facturation. Pour une inscription non finalisée
 * (paiement abandonné), propose de reprendre le paiement — relance une
 * session Stripe Checkout pour la boutique EXISTANTE (sans recréer de
 * compte). Pour un abonnement résilié, même bouton pour réactiver.
 */
export default function BillingBlock({ reason }: { reason: 'incomplete' | 'cancelled' }) {
  const isIncomplete = reason === 'incomplete';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/billing/checkout', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.checkout_url) {
        setError(
          j.error === 'STRIPE_NOT_CONFIGURED' || j.error === 'PRICE_NOT_CONFIGURED'
            ? 'Le paiement n\'est pas encore configuré. Contactez le support.'
            : (j.message ?? 'Impossible de démarrer le paiement.'),
        );
        return;
      }
      window.location.assign(j.checkout_url);
    } catch {
      setError('Réseau indisponible.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 p-6">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-deep text-2xl">
          {isIncomplete ? '⏳' : '🔒'}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {isIncomplete ? 'Finalisez votre inscription' : 'Abonnement inactif'}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {isIncomplete
            ? 'Ajoutez un moyen de paiement pour activer votre boutique. Essai gratuit, aucun débit immédiat.'
            : 'Votre abonnement a été résilié ou a expiré. Réactivez-le pour retrouver l\'accès à votre caisse.'}
        </p>

        {error && (
          <div className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}

        <button onClick={() => void pay()} disabled={busy} className="btn-primary mt-5 w-full h-11">
          {busy ? 'Redirection…' : (isIncomplete ? 'Finaliser le paiement' : 'Réactiver mon abonnement')}
        </button>
        <button onClick={() => void logout()} className="btn-ghost mt-2 w-full text-sm">
          Se déconnecter
        </button>
        <p className="mt-3 text-xs text-ink-soft">Besoin d&apos;aide ? Contactez le support.</p>
      </div>
    </main>
  );
}
