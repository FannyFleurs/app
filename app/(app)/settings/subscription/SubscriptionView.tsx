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

const ADDONS: Array<{ key: string; label: string; price: string; description: string }> = [
  {
    key: 'multi_device',
    label: 'Multi-appareils',
    price: '+9 €/mois',
    description: 'Connectez Webpos sur plusieurs iPads / postes simultanément (vendeurs en parallèle).',
  },
];

export default function SubscriptionView() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/subscription');
      if (r.ok) setData(await r.json());
      setLoading(false);
    })();
  }, []);

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
                  disabled={isCurrent}
                  title={isCurrent ? 'Vous êtes sur ce plan' : 'Le paiement en ligne arrive bientôt'}
                >
                  {isCurrent ? 'Plan actuel' : 'Choisir ce plan'}
                </button>
              </div>
            );
          })}
        </div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-soft mt-6 mb-3">
          Options
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADDONS.map((a) => (
            <div key={a.key} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{a.label}</div>
                  <div className="text-lg font-semibold tracking-tight">{a.price}</div>
                </div>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{a.description}</p>
              <button className="btn-soft mt-3 text-sm w-full" disabled
                      title="Demandez l'activation à contact@webpos.fr">
                Activer l&apos;option
              </button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Pour activer votre abonnement, contactez{' '}
          <a href="mailto:contact@webpos.fr" className="text-accent-deep hover:underline">
            contact@webpos.fr
          </a>. Le paiement en ligne (Stripe) arrive prochainement.
        </p>
      </div>
    </div>
  );
}
