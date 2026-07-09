/**
 * Intégration Stripe (facturation SaaS) via l'API REST, sans SDK.
 * Les clés proviennent de la config plateforme (platform_settings),
 * éditée par le super-admin dans /admin/configuration.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';

const STRIPE_API = 'https://api.stripe.com/v1';

export async function getPlatformConfig(): Promise<PlatformSettings> {
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    return mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    return mergePlatformDefaults(null);
  }
}

/** La facturation est-elle configurée (clé + au moins un prix) ? */
export function billingConfigured(c: PlatformSettings): boolean {
  return !!c.stripe_secret_key && (!!c.stripe_price_essentiel || !!c.stripe_price_croissance);
}

/** Encode un objet en x-www-form-urlencoded façon Stripe (clés imbriquées). */
function encodeForm(obj: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  }
  return p.toString();
}

async function stripePost<T>(secretKey: string, path: string, body: Record<string, string | number | undefined>): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
  }
  return json as T;
}

export async function createStripeCustomer(
  c: PlatformSettings,
  params: { email: string; name: string; orgId: string },
): Promise<string> {
  const cust = await stripePost<{ id: string }>(c.stripe_secret_key, '/customers', {
    email: params.email,
    name: params.name,
    'metadata[organization_id]': params.orgId,
  });
  return cust.id;
}

export async function createCheckoutSession(
  c: PlatformSettings,
  params: {
    customerId: string;
    priceId: string;
    orgId: string;
    trialDays: number;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ id: string; url: string }> {
  return stripePost<{ id: string; url: string }>(c.stripe_secret_key, '/checkout/sessions', {
    mode: 'subscription',
    customer: params.customerId,
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': 1,
    'subscription_data[trial_period_days]': params.trialDays,
    client_reference_id: params.orgId,
    'metadata[organization_id]': params.orgId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: 'true',
  });
}

/**
 * Vérifie la signature d'un webhook Stripe (header Stripe-Signature).
 * Retourne l'event parsé si valide, sinon lève.
 */
export function verifyStripeWebhook(payload: string, sigHeader: string, secret: string): unknown {
  // Format : "t=timestamp,v1=signature[,v1=...]"
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => kv.split('=') as [string, string]),
  );
  const timestamp = parts['t'];
  const expected = parts['v1'];
  if (!timestamp || !expected) throw new Error('Signature Stripe invalide');

  const signedPayload = `${timestamp}.${payload}`;
  const digest = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Signature Stripe non vérifiée');
  }
  return JSON.parse(payload);
}

/** Mappe le plan interne (offre) vers son Price ID configuré. */
export function priceForPlan(c: PlatformSettings, plan: 'essentiel' | 'croissance'): string {
  return plan === 'croissance' ? c.stripe_price_croissance : c.stripe_price_essentiel;
}

/** Mappe l'offre vers le plan de la table subscriptions. */
export function subscriptionPlan(plan: 'essentiel' | 'croissance'): 'starter' | 'pro' {
  return plan === 'croissance' ? 'pro' : 'starter';
}
