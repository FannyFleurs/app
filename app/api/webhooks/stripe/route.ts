import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { query } from '@/lib/db/client';
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
 * Le MÊME endpoint reçoit les événements de TOUS les comptes Stripe d'une
 * organisation (un par boutique — voir docs/architecture-multi-store-stripe.md) :
 *   POST https://VOTRE-DOMAINE/api/webhooks/stripe
 * à configurer UNE FOIS dans chaque compte Stripe (Fanny Fleurs, Plante
 * Verte, …), chacun avec son PROPRE secret de signature (enregistré dans
 * Paramètres → Modes de règlement, section Stripe, boutique par boutique).
 * Ce handler ne fait jamais confiance à la boutique indiquée en metadata :
 * il relit la vente/commande/commande carte cadeau réellement persistée
 * pour savoir QUEL secret doit vérifier l'événement (voir
 * `handleGiftCardWebhook`/`handleSaleOrOrderWebhook` ci-dessous).
 *
 * Événements à écouter au minimum, pour CHAQUE compte Stripe :
 *   - checkout.session.completed
 *   - checkout.session.expired
 *   - payment_intent.payment_failed
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

  // --- Lien de paiement vente/commande différée : MULTI-COMPTES Stripe,
  //     même principe que les cartes cadeaux — jamais confiance à la seule
  //     metadata pour choisir le compte qui doit vérifier la signature. ---
  return handleSaleOrOrderWebhook({
    event, sessionObj, orderId, saleId, metadataOrgId: orgId, sigHeader, raw,
  });
}

/**
 * Lien de paiement (vente caisse ou commande différée), MULTI-COMPTES
 * Stripe — même résolution de confiance que `handleGiftCardWebhook` :
 *   1. On relit la vente/commande PERSISTÉE par son id — jamais la
 *      metadata reçue. `organization_id`/`store_id` de cette ligne sont la
 *      SEULE source de vérité (posés à la création de la vente/commande,
 *      jamais fournis par le client final qui paie).
 *   2. Si l'`organization_id` de la metadata reçue ne correspond pas à
 *      celle de la ligne réellement enregistrée, on ignore SANS tenter de
 *      vérifier la signature.
 *   3. On charge le compte Stripe de LA BOUTIQUE de cette vente/commande
 *      (repli organisation si elle n'a pas encore son compte propre) et on
 *      vérifie la signature avec CE secret précis — un client de Plante
 *      Verte ne peut donc jamais faire confirmer son paiement via le
 *      compte Fanny Fleurs, et inversement : la signature ne
 *      correspondrait jamais.
 */
async function handleSaleOrOrderWebhook(args: {
  event: { type: string };
  sessionObj: { payment_status?: string };
  orderId: string | undefined;
  saleId: string | undefined;
  metadataOrgId: string;
  sigHeader: string | null;
  raw: string;
}): Promise<NextResponse> {
  let target: { organization_id: string; store_id: string } | null = null;
  if (args.orderId) {
    const r = await query<{ organization_id: string; store_id: string }>(
      `SELECT organization_id, store_id FROM orders WHERE id = $1`,
      [args.orderId],
    );
    target = r.rows[0] ?? null;
  } else if (args.saleId) {
    const r = await query<{ organization_id: string; store_id: string }>(
      `SELECT organization_id, store_id FROM sales WHERE id = $1`,
      [args.saleId],
    );
    target = r.rows[0] ?? null;
  }
  if (!target) return NextResponse.json({ ok: true, ignored: true });
  if (target.organization_id !== args.metadataOrgId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { settings: cfg } = await loadStripeSettings(target.organization_id, target.store_id);
  if (!cfg.webhook_secret || !args.sigHeader
      || !verifyStripeSignature(args.raw, args.sigHeader, cfg.webhook_secret)) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  // Signature valide POUR LE COMPTE STRIPE DE CETTE BOUTIQUE PRÉCISE.
  let newStatus: 'paid' | 'failed' | null = null;
  if (args.event.type === 'checkout.session.completed' && args.sessionObj.payment_status === 'paid') {
    newStatus = 'paid';
  } else if (args.event.type === 'payment_intent.payment_failed') {
    newStatus = 'failed';
  } else if (args.event.type === 'checkout.session.expired') {
    newStatus = 'failed';
  }

  if (newStatus) {
    if (args.orderId) {
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
        [newStatus, args.orderId, target.organization_id],
      );
    }
    if (args.saleId) {
      // Migration 0020 ajoute payment_status sur sales — silencieux sinon
      try {
        await query(
          `UPDATE sales
              SET payment_status = $1,
                  paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END,
                  updated_at = now()
            WHERE id = $2 AND organization_id = $3`,
          [newStatus, args.saleId, target.organization_id],
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
