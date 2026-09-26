import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { query } from '@/lib/db/client';
import { STRIPE_KEY, mergeStripeDefaults, type StripeSettings } from '@/lib/settings/stripe';
import { loadStripeSettings } from '@/lib/settings/stripe-server';
import { fulfillOnlineGiftCardCheckout, markOnlineGiftCardOrderExpired } from '@/lib/services/online-gift-card-fulfillment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Webhook Stripe : reçoit les notifications d'événements (paiement réussi,
 * échec, expiration de session…) et met à jour orders.payment_status /
 * sales.payment_status / online_gift_card_orders (émission de carte cadeau,
 * étape 4 — voir docs/api-public-gift-cards.md).
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
  let event: { type: string; created?: number; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // Récupère l'organisation et la cible (order, sale, OU commande carte
  // cadeau en ligne) depuis metadata.
  const sessionObj = event.data?.object as {
    id?: string;
    metadata?: {
      organization_id?: string; order_id?: string; sale_id?: string;
      hello_pos_type?: string; gift_card_order_id?: string;
    };
    payment_status?: string;
    amount_total?: number;
    currency?: string;
    payment_intent?: string;
  };
  const orgId = sessionObj?.metadata?.organization_id;
  const orderId = sessionObj?.metadata?.order_id;
  const saleId = sessionObj?.metadata?.sale_id;
  // Tag explicite requis (pas seulement la présence de l'id) : ce webhook ne
  // doit reconnaître QUE les événements HelloPos de cartes cadeaux en ligne.
  const giftCardOrderId = sessionObj?.metadata?.hello_pos_type === 'online_gift_card'
    ? sessionObj?.metadata?.gift_card_order_id
    : undefined;
  if (!orgId || (!orderId && !saleId && !giftCardOrderId)) {
    // Pas d'orga / cible reconnue dans la metadata : on ignore poliment
    return NextResponse.json({ ok: true, ignored: true });
  }

  // --- Carte cadeau en ligne (étape 4) : chemin dédié, MULTI-COMPTES
  //     Stripe (une organisation peut avoir un compte Stripe PAR boutique —
  //     voir docs/architecture-multi-store-stripe.md). Une metadata
  //     store_id/organization_id seule n'est JAMAIS une preuve : ce bloc
  //     résout le compte Stripe ATTENDU depuis la commande RÉELLEMENT
  //     persistée (source de vérité base), jamais depuis la metadata de
  //     l'événement reçu, avant même de tenter la vérification de
  //     signature — un événement du compte Stripe d'une autre boutique/
  //     organisation ne peut donc jamais valider CETTE commande : sa
  //     signature ne correspondra jamais au secret attendu. ---
  if (giftCardOrderId && sessionObj.id) {
    return handleGiftCardWebhook({
      event, sessionObj, giftCardOrderId, metadataOrgId: orgId, sigHeader, raw,
    });
  }

  // Charge la config Stripe de cette orga pour vérifier la signature
  const cfgRes = await query<{ value: Partial<StripeSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [orgId, STRIPE_KEY],
  );
  const cfg = mergeStripeDefaults(cfgRes.rows[0]?.value ?? null);

  // Validation de la signature Stripe (HMAC SHA256) — OBLIGATOIRE.
  // Sans secret configuré ou sans en-tête de signature, on refuse : sinon un
  // acteur malveillant pourrait POSTer un faux événement « paid » sans
  // signature et marquer une vente/commande comme payée gratuitement.
  if (!cfg.webhook_secret || !sigHeader
      || !verifyStripeSignature(raw, sigHeader, cfg.webhook_secret)) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
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
    if (orderId) {
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
    if (saleId) {
      // Migration 0020 ajoute payment_status sur sales — silencieux sinon
      try {
        await query(
          `UPDATE sales
              SET payment_status = $1,
                  paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END,
                  updated_at = now()
            WHERE id = $2 AND organization_id = $3`,
          [newStatus, saleId, orgId],
        );
      } catch { /* migration absente */ }
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Chemin dédié « carte cadeau en ligne » (étape 4), MULTI-COMPTES Stripe.
 *
 * Résolution de confiance, dans cet ordre STRICT :
 *   1. On relit la commande PERSISTÉE par son id (gift_card_order_id) —
 *      jamais la metadata reçue. `organization_id`/`store_id` de cette
 *      ligne sont la SEULE source de vérité : ils ont été posés au moment
 *      du checkout (resolveActiveOnlineGiftCards), jamais fournis par le
 *      navigateur.
 *   2. Si la metadata `organization_id` reçue ne correspond pas à celle de
 *      la commande réellement enregistrée, on ignore SANS même tenter de
 *      vérifier la signature (rien à prouver : la cible visée est déjà
 *      incohérente).
 *   3. On charge le compte Stripe ATTENDU pour cette commande — celui de sa
 *      boutique réelle (repli organisation si commande antérieure au
 *      multi-boutique) — et on vérifie la signature avec CE secret précis.
 *      Un événement provenant du compte Stripe d'une AUTRE boutique/
 *      organisation ne peut jamais produire une signature valide pour ce
 *      secret (chaque compte Stripe a le sien) : c'est cette étape,
 *      cryptographique, qui empêche un compte A de valider une commande B.
 * Idempotence déjà garantie en aval par fulfillOnlineGiftCardCheckout
 * (verrouillage de ligne + statut non-'pending').
 */
async function handleGiftCardWebhook(args: {
  event: { type: string; created?: number };
  sessionObj: {
    id?: string; payment_status?: string; amount_total?: number;
    currency?: string; payment_intent?: string;
  };
  giftCardOrderId: string;
  metadataOrgId: string;
  sigHeader: string | null;
  raw: string;
}): Promise<NextResponse> {
  const orderRes = await query<{ organization_id: string; store_id: string | null }>(
    `SELECT organization_id, store_id FROM online_gift_card_orders WHERE id = $1`,
    [args.giftCardOrderId],
  );
  const order = orderRes.rows[0];
  if (!order) return NextResponse.json({ ok: true, ignored: true });
  if (order.organization_id !== args.metadataOrgId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { settings: cfg } = await loadStripeSettings(order.organization_id, order.store_id);
  if (!cfg.webhook_secret || !args.sigHeader
      || !verifyStripeSignature(args.raw, args.sigHeader, cfg.webhook_secret)) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  // Signature valide POUR LE COMPTE STRIPE DE CETTE COMMANDE PRÉCISE : à
  // partir d'ici, l'événement est prouvé authentique pour cette boutique.
  if (args.event.type === 'checkout.session.completed' && args.sessionObj.id) {
    const eventCreatedAt = args.event.created
      ? new Date(args.event.created * 1000).toISOString()
      : new Date().toISOString();
    const outcome = await fulfillOnlineGiftCardCheckout({
      organizationId: order.organization_id,
      giftCardOrderId: args.giftCardOrderId,
      stripeSessionId: args.sessionObj.id,
      paymentStatus: args.sessionObj.payment_status,
      amountTotalCents: args.sessionObj.amount_total,
      currency: args.sessionObj.currency,
      paymentIntentId: args.sessionObj.payment_intent ?? null,
      eventCreatedAt,
    });
    if (outcome !== 'issued' && outcome !== 'already_issued' && outcome !== 'not_paid') {
      // Anomalie réelle (incohérence session/montant/devise, commande
      // introuvable) : ne doit normalement jamais arriver avec un événement
      // Stripe légitime — journalisé, jamais exposé publiquement.
      // eslint-disable-next-line no-console
      console.error('[gift-cards.webhook]', args.giftCardOrderId, outcome);
    }
  } else if (args.event.type === 'checkout.session.expired') {
    await markOnlineGiftCardOrderExpired(order.organization_id, args.giftCardOrderId);
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
