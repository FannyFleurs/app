import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import { getPlatformConfig, createBillingPortalSession } from '@/lib/billing/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/portal
 * Ouvre le portail de facturation Stripe pour l'organisation de
 * l'utilisateur : moyen de paiement, factures, changement d'offre,
 * résiliation. Nécessite un client Stripe (donc un abonnement démarré).
 */
export async function POST() {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const platform = await getPlatformConfig();
  if (!platform.stripe_secret_key) {
    return NextResponse.json({ error: 'STRIPE_NOT_CONFIGURED' }, { status: 400 });
  }

  const sub = await query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM subscriptions WHERE organization_id = $1`,
    [g.user.organizationId],
  );
  const customerId = sub.rows[0]?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({
      error: 'NO_CUSTOMER',
      message: 'Aucun abonnement Stripe actif. Souscrivez d\'abord une offre.',
    }, { status: 400 });
  }

  const h = headers();
  const host = (h.get('host') ?? '').toLowerCase();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const returnUrl = `${proto}://${host}/settings/subscription`;

  try {
    const session = await createBillingPortalSession(platform, { customerId, returnUrl });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[billing.portal]', err);
    return NextResponse.json({ error: 'STRIPE_ERROR', message: (err as Error).message }, { status: 502 });
  }
}
