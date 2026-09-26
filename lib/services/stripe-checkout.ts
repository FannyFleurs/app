import 'server-only';

/**
 * Appels Stripe pour la vente de carte cadeau en ligne — API REST directe
 * (comme le reste de HelloPos : pas de SDK `stripe` installé), paramétrés
 * par la clé secrète de l'organisation elle-même. Mêmes conventions que les
 * routes existantes (app/api/sales/[id]/payment-link/route.ts,
 * app/api/orders/[id]/payment-link/route.ts) : `fetch` +
 * `application/x-www-form-urlencoded`, aucune dépendance nouvelle.
 */

export interface CreateCheckoutSessionArgs {
  secretKey: string;
  /** Idempotence CÔTÉ STRIPE (indépendante de celle de HelloPos) : protège
   *  contre un retry de NOTRE serveur vers Stripe (timeout réseau, etc.) —
   *  toujours dérivée de l'id interne de la tentative, jamais du navigateur. */
  stripeIdempotencyKey: string;
  amountCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
  metadata: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

export class StripeApiError extends Error {
  constructor(message: string, public readonly stripeMessage?: string) {
    super(message);
    this.name = 'StripeApiError';
  }
}

export async function createGiftCardCheckoutSession(
  args: CreateCheckoutSessionArgs,
): Promise<StripeCheckoutSession> {
  const body = new URLSearchParams();
  body.append('mode', 'payment');
  body.append('payment_method_types[]', 'card');
  body.append('line_items[0][price_data][currency]', 'eur');
  body.append('line_items[0][price_data][product_data][name]', args.productName);
  body.append('line_items[0][price_data][unit_amount]', String(args.amountCents));
  body.append('line_items[0][quantity]', '1');
  body.append('success_url', args.successUrl);
  body.append('cancel_url', args.cancelUrl);
  body.append('customer_email', args.customerEmail);
  for (const [k, v] of Object.entries(args.metadata)) {
    body.append(`metadata[${k}]`, v);
  }

  let res: Response;
  try {
    res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${args.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': args.stripeIdempotencyKey,
      },
      body: body.toString(),
    });
  } catch (err) {
    throw new StripeApiError('STRIPE_REQUEST_FAILED', (err as Error).message);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StripeApiError('STRIPE_API_ERROR', json.error?.message ?? 'Erreur Stripe');
  }
  return { id: json.id, url: json.url };
}

/**
 * Relit une Checkout Session existante — sert au rejeu idempotent (étape 3,
 * §15) : si une tentative identique est renvoyée alors que la session Stripe
 * précédente est toujours ouverte, on redonne son URL plutôt que d'en créer
 * une seconde.
 */
export async function retrieveCheckoutSession(
  secretKey: string,
  sessionId: string,
): Promise<{ id: string; url: string | null; status: string } | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    });
  } catch (err) {
    throw new StripeApiError('STRIPE_REQUEST_FAILED', (err as Error).message);
  }
  if (res.status === 404) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StripeApiError('STRIPE_API_ERROR', json.error?.message ?? 'Erreur Stripe');
  }
  return { id: json.id, url: json.url ?? null, status: json.status };
}
