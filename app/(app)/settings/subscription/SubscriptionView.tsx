'use client';

import { useEffect, useState } from 'react';
import Badge from '@/components/Badge';

interface Data {
  organization: { plan: string; trial_ends_at: string | null } | null;
  subscription: {
    plan: string; status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  extra_registers?: number;
  addon_register_price?: string;
  addon_register_available?: boolean;
  migration_required?: string;
}

interface Plan {
  key: 'trial' | 'starter' | 'pro';
  label: string;
  price: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    key: 'starter',
    label: 'Starter',
    price: '29 €/mois',
    features: [
      '1 boutique, 1 caisse',
      'Catalogue illimité',
      'Tickets fiscaux conformes',
      'Support email',
    ],
  },
  {
    key: 'pro',
    label: 'Pro',
    price: '59 €/mois',
    highlight: true,
    features: [
      'Jusqu\'à 3 boutiques, 5 caisses',
      'Programme de fidélité',
      'Factures B2B, avoirs, exports',
      'Support prioritaire',
    ],
  },
];

// Options additionnelles statiques (l'option "caisse supplémentaire" est
// gérée dynamiquement plus bas selon la config Stripe).
const ADDONS: Array<{ key: string; label: string; price: string; description: string }> = [];

export default function SubscriptionView() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addonBusy, setAddonBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const r = await fetch('/api/subscription');
    if (r.ok) setData(await r.json());
  }
  useEffect(() => { void reload().finally(() => setLoading(false)); }, []);

  // Ajuste l'option caisse supplémentaire (+1 / −1).
  async function changeAddon(delta: number) {
    setAddonBusy(true); setError(null);
    try {
      const r = await fetch('/api/billing/addon/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.message ?? j.error ?? 'Impossible de modifier l\'option.');
        return;
      }
      await reload();
    } finally {
      setAddonBusy(false);
    }
  }

  // Ouvre le portail de facturation Stripe (moyen de paiement, factures,
  // changement d'offre, résiliation). Si aucun abonnement Stripe n'existe
  // encore, démarre un paiement (checkout).
  async function openBilling() {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { window.location.assign(j.url); return; }
      if (j.error === 'NO_CUSTOMER') {
        // Pas encore d'abonnement Stripe : on lance un checkout.
        const c = await fetch('/api/billing/checkout', { method: 'POST' });
        const cj = await c.json().catch(() => ({}));
        if (c.ok && cj.checkout_url) { window.location.assign(cj.checkout_url); return; }
        setError(cj.message ?? cj.error ?? 'Le paiement n\'est pas encore configuré.');
        return;
      }
      setError(
        j.error === 'STRIPE_NOT_CONFIGURED'
          ? 'La facturation en ligne n\'est pas encore activée. Contactez le support.'
          : (j.message ?? 'Impossible d\'ouvrir la facturation.'),
      );
    } catch {
      setError('Réseau indisponible.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-ink-soft">Chargement…</div>;
  if (!data) return <div className="p-8 text-sm text-danger">Erreur de chargement.</div>;

  const currentPlan = data.subscription?.plan ?? data.organization?.plan ?? 'trial';
  const isTrial = currentPlan === 'trial';
  const trialEnds = data.organization?.trial_ends_at
    ? new Date(data.organization.trial_ends_at)
    : null;
  const daysLeft = trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Abonnement</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Gérez votre plan, votre période d&apos;essai et vos factures.
        </p>
      </div>

      {data.migration_required && (
        <div className="card p-4 bg-warning/10 border-warning/30 text-sm">
          ⚠ Migration manquante : exécutez <code className="bg-white px-1 rounded">npm run db:migrate</code>{' '}
          ({data.migration_required}) pour activer le suivi d&apos;abonnement.
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold">
              Plan actuel
            </div>
            <div className="mt-1 text-3xl font-semibold tracking-tight capitalize">
              {currentPlan}
            </div>
          </div>
          <div>
            <Badge tone={
              isTrial ? 'warning'
              : data.subscription?.status === 'active' ? 'success'
              : data.subscription?.status === 'past_due' ? 'warning'
              : 'neutral'
            }>
              {data.subscription?.status === 'active' ? 'Actif'
                : isTrial ? `Essai${daysLeft != null ? ` · ${daysLeft} j restants` : ''}`
                : data.subscription?.status ?? 'Inactif'}
            </Badge>
          </div>
        </div>

        {isTrial && trialEnds && (
          <p className="mt-3 text-sm text-ink-soft">
            Votre essai gratuit se termine le{' '}
            <strong className="text-ink">
              {trialEnds.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </strong>
            . Passez à un plan payant pour continuer après cette date.
          </p>
        )}

        {data.subscription?.current_period_end && !isTrial && (
          <p className="mt-3 text-sm text-ink-soft">
            Prochaine échéance le{' '}
            <strong className="text-ink">
              {new Date(data.subscription.current_period_end).toLocaleDateString('fr-FR')}
            </strong>
            {data.subscription.cancel_at_period_end && (
              <span className="text-warning"> · résiliation prévue à l&apos;échéance</span>
            )}.
          </p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-soft mb-3">
          Choisir un plan
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLANS.map((p) => {
            const isCurrent = p.key === currentPlan;
            return (
              <div
                key={p.key}
                className={`card p-5 flex flex-col ${
                  p.highlight ? 'ring-2 ring-offset-1' : ''
                }`}
                style={p.highlight ? { ['--tw-ring-color' as string]: 'var(--primary)' } : undefined}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-lg">{p.label}</div>
                    <div className="text-2xl font-semibold tracking-tight mt-0.5">{p.price}</div>
                  </div>
                  {p.highlight && <Badge tone="success">Recommandé</Badge>}
                </div>
                <ul className="mt-3 space-y-1 text-sm flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-success mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={isCurrent ? 'btn-ghost mt-4' : 'btn-primary mt-4'}
                  disabled={isCurrent || busy}
                  onClick={() => void openBilling()}
                  title={isCurrent ? 'Vous êtes sur ce plan' : 'Gérer via le portail sécurisé Stripe'}
                >
                  {isCurrent ? 'Plan actuel' : (busy ? '…' : 'Choisir ce plan')}
                </button>
              </div>
            );
          })}
        </div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-soft mt-6 mb-3">
          Options
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Caisse supplémentaire (offre Essentiel) */}
          {data.addon_register_available && (
            <div className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">Caisse supplémentaire</div>
                  <div className="text-lg font-semibold tracking-tight">
                    +{data.addon_register_price ?? '9'} €/mois
                  </div>
                </div>
                <Badge tone="neutral">{data.extra_registers ?? 0} active(s)</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                Ajoutez des caisses à votre offre Essentiel. Facturé au prorata,
                résiliable à tout moment.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button className="btn-primary text-sm flex-1" disabled={busy || addonBusy}
                        onClick={() => void changeAddon(1)}>
                  {addonBusy ? '…' : '+ Ajouter une caisse'}
                </button>
                {(data.extra_registers ?? 0) > 0 && (
                  <button className="btn-ghost text-sm" disabled={busy || addonBusy}
                          onClick={() => void changeAddon(-1)}>
                    − Retirer
                  </button>
                )}
              </div>
            </div>
          )}
          {ADDONS.map((a) => (
            <div key={a.key} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{a.label}</div>
                  <div className="text-lg font-semibold tracking-tight">{a.price}</div>
                </div>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{a.description}</p>
              <button className="btn-soft mt-3 text-sm w-full" onClick={() => void openBilling()} disabled={busy}>
                Gérer dans la facturation
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
      </div>

      {/* Gestion de la facturation (portail Stripe) */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="font-semibold">Facturation &amp; paiement</div>
          <p className="mt-1 text-sm text-ink-soft">
            Moyen de paiement, factures, changement d&apos;offre et résiliation,
            via le portail sécurisé Stripe.
          </p>
        </div>
        <button onClick={() => void openBilling()} disabled={busy} className="btn-primary shrink-0">
          {busy ? 'Ouverture…' : 'Gérer mon abonnement'}
        </button>
      </div>
    </div>
  );
}
