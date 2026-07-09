import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import {
  getPlatformConfig, billingConfigured, priceForPlan,
  createStripeCustomer, createCheckoutSession,
} from '@/lib/billing/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/checkout
 * Relance une session Stripe Checkout pour l'organisation de
 * l'utilisateur connecté dont l'inscription n'est PAS finalisée
 * (paiement abandonné). Réutilise le client Stripe existant si présent.
 */
export async function POST() {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const platform = await getPlatformConfig();
  if (!billingConfigured(platform)) {
    return NextResponse.json({ error: 'STRIPE_NOT_CONFIGURED' }, { status: 400 });
  }

  const orgRes = await query<{
    onboarding_complete: boolean; name: string;
    plan: string | null; stripe_customer_id: string | null;
  }>(
    `SELECT o.onboarding_complete, o.name, s.plan, s.stripe_customer_id
       FROM organizations o
       LEFT JOIN subscriptions s ON s.organization_id = o.id
      WHERE o.id = $1`,
    [g.user.organizationId],
  );
  const org = orgRes.rows[0];
  if (!org) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (org.onboarding_complete) {
    return NextResponse.json({ error: 'ALREADY_ACTIVE' }, { status: 400 });
  }

  // Offre : depuis le plan de la subscription (starter/pro), sinon défaut.
  const plan: 'essentiel' | 'croissance' = org.plan === 'pro' ? 'croissance' : 'essentiel';
  const priceId = priceForPlan(platform, plan);
  if (!priceId) {
    return NextResponse.json({ error: 'PRICE_NOT_CONFIGURED' }, { status: 400 });
  }

  const h = headers();
  const host = (h.get('host') ?? '').toLowerCase();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = `${proto}://${host}`;

  try {
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      customerId = await createStripeCustomer(platform, {
        email: g.user.email,
        name: org.name,
        orgId: g.user.organizationId,
      });
      await query(
        `UPDATE subscriptions SET stripe_customer_id = $1 WHERE organization_id = $2`,
        [customerId, g.user.organizationId],
      );
    }
    const session = await createCheckoutSession(platform, {
      customerId,
      priceId,
      orgId: g.user.organizationId,
      trialDays: platform.trial_days || 14,
      successUrl: `${origin}/caisse?welcome=1`,
      cancelUrl: `${origin}/caisse`,
    });
    return NextResponse.json({ checkout_url: session.url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing.checkout]', err);
    return NextResponse.json({ error: 'STRIPE_ERROR', message: (err as Error).message }, { status: 502 });
  }
}
