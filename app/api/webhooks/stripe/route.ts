import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { query } from '@/lib/db/client';
import { STRIPE_KEY, mergeStripeDefaults, type StripeSettings } from '@/lib/settings/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Webhook Stripe : reçoit les notifications d'événements (paiement réussi,
 * échec, expiration de session…) et met à jour orders.payment_status.
 *
 * URL à configurer dans Stripe Dashboard → Webhooks :
 *   POST https://VOTRE-DOMAINE/api/webhooks/stripe
 * Événements à écouter au minimum :
 *   - checkout.session.completed
 *   - checkout.session.expired
 *   - payment_intent.payment_failed
 *
 * Le webhook signing secret doit être enregistré dans
 * Paramètres → Stripe (whsec_...) pour valider la signature.
 */
export async function POST(req: Request) {
  const sigHeader = req.headers.get('stripe-signature');
  const raw = await req.text();
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // Récupère l'organisation depuis metadata
  const sessionObj = event.data?.object as {
    id?: string;
    metadata?: { organization_id?: string; order_id?: string };
    payment_status?: string;
  };
  const orgId = sessionObj?.metadata?.organization_id;
  const orderId = sessionObj?.metadata?.order_id;
  if (!orgId || !orderId) {
    // Pas d'orga / order dans la metadata : on ignore poliment
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Charge la config Stripe de cette orga pour vérifier la signature
  const cfgRes = await query<{ value: Partial<StripeSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [orgId, STRIPE_KEY],
  );
  const cfg = mergeStripeDefaults(cfgRes.rows[0]?.value ?? null);

  // Validation de la signature Stripe (HMAC SHA256)
  if (cfg.webhook_secret && sigHeader) {
    if (!verifyStripeSignature(raw, sigHeader, cfg.webhook_secret)) {
      return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
    }
  }

  let newStatus: 'paid' | 'failed' | null = null;
  if (event.type === 'checkout.session.completed' && sessionObj.payment_status === 'paid') {
    newStatus = 'paid';
  } else if (event.type === 'payment_intent.payment_failed') {
    newStatus = 'failed';
  } else if (event.type === 'checkout.session.expired') {
    newStatus = 'failed';
  }

  if (newStatus) {
    await query(
      `UPDATE orders
          SET payment_status = $1,
              paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END,
              status = CASE
                WHEN $1 = 'paid' AND status = 'confirmed' THEN 'in_preparation'
                ELSE status
              END,
              updated_at = now()
        WHERE id = $2 AND organization_id = $3`,
      [newStatus, orderId, orgId],
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Vérifie la signature Stripe avec HMAC SHA256.
 * Le header `Stripe-Signature` ressemble à : t=1234,v1=hmac,v0=...
 */
function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=', 2) as [string, string]),
  ) as Record<string, string>;
  if (!parts.t || !parts.v1) return false;
  const signed = `${parts.t}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(parts.v1, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
