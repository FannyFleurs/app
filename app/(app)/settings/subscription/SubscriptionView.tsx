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
  current_plan_name?: string;
  plans?: {
    starter: { name: string; price: string };
    pro: { name: string; price: string };
    enterprise: { name: string; price: string; available: boolean };
  };
  migration_required?: string;
}

interface Plan {
  key: 'starter' | 'pro' | 'enterprise';
  label: string;
  price: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    key: 'starter',
    label: 'Essentiel',
    price: '29 €/mois',
    features: [
      '1 boutique · 1 caisse (+ caisses en option)',
      'Catalogue illimité',
      'Tickets fiscaux conformes',
      'Support email',
    ],
  },
  {
    key: 'pro',
    label: 'Croissance',
    price: '59 €/mois',
    highlight: true,
    features: [
      '1 boutique · jusqu\'à 5 caisses',
      'Écran & Livraison (commande différée)',
      'Programme de fidélité',
      'Factures B2B, avoirs, exports',
      'Support prioritaire',
    ],
  },
  {
    key: 'enterprise',
    label: 'Réseau',
    price: 'Sur mesure',
    features: [
      'Boutiques illimitées · caisses illimitées',
      'Gestion multi-boutiques centralisée',
      'Suivi du CA consolidé',
      'Toutes les fonctionnalités Croissance',
      'Accompagnement dédié',
    ],
  },
];

// Options additionnelles statiques (l'option "caisse supplémentaire" est
// gérée dynamiquement plus bas selon la config Stripe).
const ADDONS: Array<{ key: string; label: string; price: string; description: string }> = [];

/**
 * App native (iOS/Android empaquetée via Capacitor) : les règles de l'App Store
 * interdisent l'achat/la gestion d'un abonnement numérique via un paiement tiers
 * (Stripe) dans l'app. On masque donc toute la partie souscription/paiement dans
 * l'app native et on n'affiche que l'état du plan en lecture seule ; la gestion
 * se fait depuis le web. Aucun changement sur navigateur.
 */
function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export default function SubscriptionView() {
  const [native] = useState(isNativeApp);
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
    <div className="p-6 md:p-8 max-w-5xl space-y-6">
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
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              {data.current_plan_name ?? currentPlan}
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

      {native ? (
        <div className="card p-6">
          <div className="font-semibold">Gestion de l&apos;abonnement</div>
          <p className="mt-1 text-sm text-ink-soft">
            La souscription et la gestion de votre abonnement HelloPos (changement
            d&apos;offre, moyen de paiement, factures, résiliation) se font depuis
            votre espace de gestion sur ordinateur. Cette page affiche l&apos;état
            de votre plan.
          </p>
        </div>
      ) : (
      <>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-soft mb-3">
          Choisir un plan
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS
            // Le plan Réseau n'apparaît que s'il est configuré côté Stripe.
            .filter((p) => p.key !== 'enterprise' || data.plans?.enterprise.available)
            .map((p) => {
            const isCurrent = p.key === currentPlan;
            // Nom + prix éventuellement personnalisés en configuration.
            const cfg = data.plans?.[p.key];
            const label = cfg?.name || p.label;
            const priceRaw = cfg?.price ?? p.price;
            // Un prix purement numérique est suffixé « €/mois ».
            const price = /^[0-9]+([.,][0-9]+)?$/.test(priceRaw.trim())
              ? `${priceRaw.trim()} €/mois`
              : priceRaw;
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
                    <div className="font-semibold text-lg">{label}</div>
                    <div className="text-2xl font-semibold tracking-tight mt-0.5">{price}</div>
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
      </>
      )}
    </div>
  );
}
