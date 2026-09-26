import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  isGiftCardAmountAllowed, validateReturnPath, DEFAULT_SUCCESS_PATH, DEFAULT_CANCEL_PATH,
} from '@/lib/settings/online-gift-cards';
import { resolveActiveOnlineGiftCards } from '@/lib/settings/online-gift-cards-server';
import { eurosToCents } from '@/lib/services/money';
import { STRIPE_KEY, mergeStripeDefaults, type StripeSettings } from '@/lib/settings/stripe';
import { createGiftCardCheckoutSession, retrieveCheckoutSession } from '@/lib/services/stripe-checkout';
import {
  createPendingOrder, findOrderByIdempotencyKey, markOrderSessionCreated, markOrderFailed,
  computeRequestFingerprint, isRateLimited, getClientIp, IdempotencyRaceError,
  type OnlineGiftCardOrder,
} from '@/lib/services/online-gift-card-orders';

export const dynamic = 'force-dynamic';

/**
 * Crée une Stripe Checkout Session pour l'achat d'une carte cadeau en ligne —
 * documenté dans docs/api-public-gift-cards.md.
 *
 * AUCUNE session HelloPos. L'organisation est déterminée EXCLUSIVEMENT par
 * `key` (hp_gc_...), exactement comme /api/public/gift-cards/config.
 *
 * IMPORTANT — cette route NE CRÉE JAMAIS de carte cadeau. Elle trace la
 * tentative (`online_gift_card_orders`, statut 'pending') et crée la session
 * de paiement Stripe. Seul le webhook de l'étape 4, après confirmation
 * serveur-à-serveur du paiement, aura le droit de faire émettre une carte
 * (via GiftCardService, non touché ici).
 */

const NOT_AVAILABLE = { error: 'GIFT_CARDS_NOT_AVAILABLE' } as const;

const personSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().min(3).max(200).email(),
}).strict();

const checkoutSchema = z.object({
  key: z.string().min(1).max(120),
  amount: z.number().finite(),
  buyer: personSchema,
  // L'acheteur peut s'offrir la carte à lui-même : recipient peut être
  // identique à buyer, rien de spécial à faire — deux champs indépendants.
  recipient: personSchema,
  message: z.string().trim().max(500).optional(),
  // Chemins relatifs STRICTEMENT validés (voir validateReturnPath) — jamais
  // une URL absolue : le navigateur ne choisit jamais l'origine de retour,
  // seulement le chemin sur celle de l'organisation résolue.
  success_path: z.string().max(200).optional(),
  cancel_path: z.string().max(200).optional(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).optional(),
}).strict(); // rejette toute clé non documentée (organization_id, price_id, metadata, …)

type CheckoutInput = z.infer<typeof checkoutSchema>;

type Outcome =
  | { kind: 'response'; response: NextResponse }
  | { kind: 'order'; order: OnlineGiftCardOrder };

/**
 * Rejeu d'une tentative déjà connue sous cette clé d'idempotence.
 * - Empreinte différente => conflit (même clé, autre contenu) : refusé.
 * - Commande déjà avancée (payée/émise/…) : refusé — on ne relance jamais
 *   Stripe pour une commande qui n'est plus 'pending'.
 * - Commande 'pending' sans session Stripe encore créée (ex. crash serveur
 *   juste après l'insertion) : on continue le flux normal sur CETTE même
 *   ligne, pas de nouvelle ligne créée.
 * - Commande 'pending' avec une session Stripe encore ouverte : on redonne
 *   directement son URL (aucun nouvel objet Stripe créé).
 * - Session Stripe expirée/complétée entre-temps : cas rare, on demande
 *   explicitement une nouvelle clé d'idempotence plutôt que de complexifier
 *   la ré-émission d'une session sur une ligne déjà utilisée.
 */
async function resolveIdempotentReplay(
  existing: OnlineGiftCardOrder, fingerprint: string, stripeSecretKey: string, corsHeaders: HeadersInit,
): Promise<Outcome> {
  if (existing.requestFingerprint !== fingerprint) {
    return { kind: 'response', response: NextResponse.json({ error: 'IDEMPOTENCY_KEY_CONFLICT' }, { status: 409, headers: corsHeaders }) };
  }
  if (existing.status !== 'pending') {
    return { kind: 'response', response: NextResponse.json({ error: 'ORDER_ALREADY_COMPLETED' }, { status: 409, headers: corsHeaders }) };
  }
  if (!existing.stripeCheckoutSessionId) {
    return { kind: 'order', order: existing };
  }
  let session;
  try {
    session = await retrieveCheckoutSession(stripeSecretKey, existing.stripeCheckoutSessionId);
  } catch {
    return { kind: 'response', response: NextResponse.json({ error: 'CHECKOUT_UNAVAILABLE' }, { status: 502, headers: corsHeaders }) };
  }
  if (session && session.status === 'open' && session.url) {
    return {
      kind: 'response',
      response: NextResponse.json({ checkout_url: session.url, reference: existing.publicReference }, { headers: corsHeaders }),
    };
  }
  return {
    kind: 'response',
    response: NextResponse.json({ error: 'ORDER_EXPIRED_RETRY_WITH_NEW_KEY' }, { status: 409, headers: corsHeaders }),
  };
}

async function resolveOrder(
  d: CheckoutInput, organizationId: string, amountCents: number,
  fingerprint: string, clientIp: string | null, stripeSecretKey: string, corsHeaders: HeadersInit,
): Promise<Outcome> {
  if (d.idempotency_key) {
    const existing = await findOrderByIdempotencyKey(organizationId, d.idempotency_key);
    if (existing) return resolveIdempotentReplay(existing, fingerprint, stripeSecretKey, corsHeaders);
  }
  try {
    const order = await createPendingOrder({
      organizationId, amountCents,
      buyerName: d.buyer.name, buyerEmail: d.buyer.email,
      recipientName: d.recipient.name, recipientEmail: d.recipient.email,
      message: d.message || null,
      idempotencyKey: d.idempotency_key ?? null,
      requestFingerprint: fingerprint,
      clientIp,
    });
    return { kind: 'order', order };
  } catch (e) {
    // Course concurrente sur la même clé (deux requêtes quasi simultanées) :
    // relit la ligne créée par l'autre requête plutôt que d'échouer.
    if (e instanceof IdempotencyRaceError && d.idempotency_key) {
      const existing = await findOrderByIdempotencyKey(organizationId, d.idempotency_key);
      if (existing) return resolveIdempotentReplay(existing, fingerprint, stripeSecretKey, corsHeaders);
    }
    throw e;
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, checkoutSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  // 1. Résolution organisation — clé bien formée + connue + intégration
  //    active. Même réponse neutre que /config pour ne rien distinguer
  //    publiquement (clé inconnue / malformée / désactivée).
  const resolved = await resolveActiveOnlineGiftCards(d.key);
  if (!resolved) return NextResponse.json(NOT_AVAILABLE, { status: 404 });
  const { organizationId, settings } = resolved;

  // Organisation active + nom (pour le libellé Stripe) — même vérification
  // que /config, pliée dans la MÊME réponse neutre en cas d'échec.
  const orgRes = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1 AND is_active = TRUE`,
    [organizationId],
  );
  const orgName = orgRes.rows[0]?.name;
  if (!orgName) return NextResponse.json(NOT_AVAILABLE, { status: 404 });

  // 2. Origin OBLIGATOIRE pour ce POST (contrairement au GET /config) : on a
  //    besoin d'une origine autorisée pour construire des URLs de retour
  //    sûres — voir docs/api-public-gift-cards.md.
  const origin = req.headers.get('origin');
  if (!origin || !settings.allowed_origins.includes(origin)) {
    return NextResponse.json({ error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }
  // À partir d'ici l'origine est confirmée légitime POUR CETTE organisation :
  // on l'échoe (jamais *) sur toutes les réponses suivantes, succès comme
  // erreurs, pour que le site appelant puisse les lire.
  const corsHeaders: HeadersInit = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };

  // 3. Montant : jamais décidé librement par le navigateur. Validé contre la
  //    configuration commerciale de CETTE organisation, puis converti en
  //    centimes entiers (jamais de flottant envoyé à Stripe).
  if (!isGiftCardAmountAllowed(d.amount, settings)) {
    return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 422, headers: corsHeaders });
  }
  let amountCents: number;
  try {
    amountCents = eurosToCents(d.amount);
  } catch (e) {
    return NextResponse.json({ error: 'INVALID_AMOUNT', message: (e as Error).message }, { status: 422, headers: corsHeaders });
  }

  // 4. Chemins de retour : reconstruits par le SERVEUR à partir de l'origine
  //    validée + un chemin relatif strictement contrôlé.
  const successPath = validateReturnPath(d.success_path, DEFAULT_SUCCESS_PATH);
  const cancelPath = validateReturnPath(d.cancel_path, DEFAULT_CANCEL_PATH);
  if (!successPath || !cancelPath) {
    return NextResponse.json({ error: 'INVALID_RETURN_PATH' }, { status: 422, headers: corsHeaders });
  }

  // 5. Anti-abus — voir lib/services/online-gift-card-orders.ts.
  const clientIp = getClientIp(req);
  if (await isRateLimited(organizationId, clientIp)) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429, headers: corsHeaders });
  }

  // 6. Stripe de CETTE organisation — jamais un Stripe global aux cartes
  //    cadeaux, jamais choisi par le payload.
  const stripeCfgRes = await query<{ value: Partial<StripeSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, STRIPE_KEY],
  );
  const stripeCfg = mergeStripeDefaults(stripeCfgRes.rows[0]?.value ?? null);
  if (!stripeCfg.enabled || !stripeCfg.secret_key) {
    return NextResponse.json({ error: 'PAYMENT_UNAVAILABLE' }, { status: 503, headers: corsHeaders });
  }

  const fingerprint = computeRequestFingerprint({
    amountCents, buyerName: d.buyer.name, buyerEmail: d.buyer.email,
    recipientName: d.recipient.name, recipientEmail: d.recipient.email,
    message: d.message || null,
  });

  // 7. Tentative interne : créée AVANT Stripe (ou réutilisée si rejeu
  //    idempotent) — jamais uniquement des metadata Stripe non persistées.
  const orderOutcome = await resolveOrder(d, organizationId, amountCents, fingerprint, clientIp, stripeCfg.secret_key, corsHeaders);
  if (orderOutcome.kind === 'response') return orderOutcome.response;
  const order = orderOutcome.order;

  // 8. Checkout Session Stripe. Le succès de la commande (au sens métier)
  //    ne se décide JAMAIS ici : ni cette réponse, ni success_url atteinte
  //    par le navigateur ne créent de carte cadeau — seul le webhook signé
  //    de l'étape 4 en aura le droit, après vérification du PaymentIntent.
  const successUrl = `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}${cancelPath}`;
  try {
    const session = await createGiftCardCheckoutSession({
      secretKey: stripeCfg.secret_key,
      // Dérivée de l'id interne : un retry de NOTRE serveur vers Stripe pour
      // CETTE MÊME tentative ne crée jamais deux sessions Stripe.
      stripeIdempotencyKey: `gc_order_${order.id}`,
      amountCents,
      productName: `Carte cadeau — ${orgName}`,
      successUrl,
      cancelUrl,
      customerEmail: d.buyer.email,
      metadata: {
        hello_pos_type: 'online_gift_card',
        gift_card_order_id: order.id,
        organization_id: organizationId,
      },
    });
    await markOrderSessionCreated(order.id, session.id);
    await audit({
      organizationId, userId: null,
      action: 'online_gift_cards.checkout_session.create',
      entityType: 'online_gift_card_order', entityId: order.id,
      payload: { amount_cents: amountCents, stripe_session_id: session.id },
    });
    return NextResponse.json(
      { checkout_url: session.url, reference: order.publicReference },
      { headers: corsHeaders },
    );
  } catch (err) {
    await markOrderFailed(order.id);
    // Journalisé serveur uniquement (comme app/api/webhooks/stripe-billing) :
    // le message Stripe brut n'est JAMAIS renvoyé dans la réponse publique.
    // Contrairement aux routes de lien de paiement internes (réservées aux
    // admins de l'organisation), cette route est publique/anonyme — un
    // message d'erreur Stripe pourrait révéler des détails du compte.
    // eslint-disable-next-line no-console
    console.error('[gift-cards.checkout]', order.publicReference, err);
    return NextResponse.json({ error: 'CHECKOUT_UNAVAILABLE' }, { status: 502, headers: corsHeaders });
  }
}

/**
 * Un préflight CORS n'a JAMAIS de corps : impossible d'y lire `key`, donc
 * impossible d'y résoudre l'organisation ni ses origines autorisées. On
 * répond ici de façon permissive (on échoe l'Origin fournie, quelle qu'elle
 * soit) pour que le navigateur autorise l'envoi du POST réel — la
 * vérification stricte (organisation + origine autorisée) a lieu sur CE
 * POST, qui seul décide d'ajouter ou non l'en-tête CORS à sa réponse. Un
 * appelant non autorisé peut donc déclencher la requête, mais jamais lire
 * une réponse utile : le préflight ne renvoie aucune donnée, juste des
 * en-têtes de méthode/en-tête autorisés.
 */
export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
