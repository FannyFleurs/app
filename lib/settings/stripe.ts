/**
 * Configuration Stripe par organisation, stockée dans la table `settings`
 * sous la clé `stripe`. Les clés secrètes ne sont JAMAIS renvoyées en
 * clair dans les réponses API (uniquement masquées : "sk_••••…1234").
 */

export const STRIPE_KEY = 'stripe';

export interface StripeSettings {
  enabled: boolean;
  publishable_key: string;
  secret_key: string;
  webhook_secret: string;
  /** URL absolue de retour après paiement réussi/abandonné. Vide = auto. */
  return_url: string;
}

export const STRIPE_DEFAULTS: StripeSettings = {
  enabled: false,
  publishable_key: '',
  secret_key: '',
  webhook_secret: '',
  return_url: '',
};

export function mergeStripeDefaults(partial: Partial<StripeSettings> | null | undefined): StripeSettings {
  if (!partial) return { ...STRIPE_DEFAULTS };
  const out = { ...STRIPE_DEFAULTS };
  for (const k of Object.keys(STRIPE_DEFAULTS) as (keyof StripeSettings)[]) {
    if (partial[k] !== undefined) {
      // @ts-expect-error merge homogène
      out[k] = partial[k];
    }
  }
  return out;
}

/** Masque une clé secrète pour l'affichage : "sk_test_••••…wXyZ". */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length < 10) return '•'.repeat(key.length);
  return key.slice(0, 7) + '••••…' + key.slice(-4);
}
