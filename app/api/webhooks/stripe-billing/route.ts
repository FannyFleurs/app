import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { getPlatformConfig, verifyStripeWebhook } from '@/lib/billing/stripe';

export const dynamic = 'force-dynamic';

/**
 * Webhook Stripe pour la facturation SaaS (abonnements des boutiques).
 * URL à déclarer dans Stripe : https://<domaine>/api/webhooks/stripe-billing
 *
 * Événements gérés :
 *   - checkout.session.completed  -> débloque l'org (paiement configuré)
 *   - customer.subscription.updated -> synchronise statut + période
 *   - invoice.payment_failed      -> past_due
 *   - customer.subscription.deleted -> cancelled (accès coupé)
 */
export async function POST(req: Request) {
  const platform = await getPlatformConfig();
  const secret = platform.stripe_webhook_secret;
  const sig = req.headers.get('stripe-signature');
  const payload = await req.text();

  if (!secret || !sig) {
    return NextResponse.json({ error: 'WEBHOOK_NOT_CONFIGURED' }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = verifyStripeWebhook(payload, sig, secret) as typeof event;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const obj = event.data.object;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const orgId = (obj.client_reference_id as string)
          ?? ((obj.metadata as Record<string, string>)?.organization_id);
        const subId = obj.subscription as string | undefined;
        if (orgId) {
          await query(
            `UPDATE organizations SET onboarding_complete = TRUE WHERE id = $1`,
            [orgId],
          );
          await query(
            `UPDATE subscriptions
                SET status = 'trialing', external_ref = COALESCE($2, external_ref),
                    updated_at = now()
              WHERE organization_id = $1`,
            [orgId, subId ?? null],
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subId = obj.id as string;
        const status = mapStatus(obj.status as string);
        const periodEnd = obj.current_period_end as number | undefined;
        await query(
          `UPDATE subscriptions
              SET status = $2,
                  current_period_end = COALESCE(to_timestamp($3), current_period_end),
                  updated_at = now()
            WHERE external_ref = $1`,
          [subId, status, periodEnd ?? null],
        );
        // Si l'abonnement redevient sain, on s'assure que l'org est débloquée.
        if (status === 'active' || status === 'trialing') {
          await query(
            `UPDATE organizations o SET onboarding_complete = TRUE
               FROM subscriptions s
              WHERE s.organization_id = o.id AND s.external_ref = $1`,
            [subId],
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const subId = obj.subscription as string | undefined;
        if (subId) {
          await query(
            `UPDATE subscriptions SET status = 'past_due', updated_at = now()
              WHERE external_ref = $1`,
            [subId],
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subId = obj.id as string;
        await query(
          `UPDATE subscriptions SET status = 'cancelled', updated_at = now()
            WHERE external_ref = $1`,
          [subId],
        );
        break;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stripe-billing.webhook]', event.type, err);
    return NextResponse.json({ error: 'HANDLER_ERROR' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'canceled':
    case 'incomplete_expired': return 'cancelled';
    case 'incomplete': return 'incomplete';
    default: return 'active';
  }
}
