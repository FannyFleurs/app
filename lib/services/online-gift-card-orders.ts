import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { query } from '@/lib/db/client';

/**
 * Tentatives d'achat de carte cadeau en ligne (`online_gift_card_orders`,
 * migration 0080). Une ligne par tentative, créée en 'pending' avant même
 * d'appeler Stripe — l'état serveur persisté que l'étape 4 (webhook) mettra
 * à jour, plutôt que de ne compter que sur des metadata Stripe non
 * persistées. AUCUNE fonction de ce fichier ne crée de carte cadeau : ça
 * reste le rôle exclusif du webhook Stripe (étape 4,
 * lib/services/online-gift-card-fulfillment.ts), via GiftCardService.
 */

export type OnlineGiftCardOrderStatus = 'pending' | 'paid' | 'issued' | 'failed' | 'expired' | 'refunded';

/**
 * Qui reçoit l'email contenant la carte (étape 5) — distinct du titulaire
 * de la carte (toujours `recipient`, inchangé depuis l'étape 4) :
 * - 'buyer'     : SEUL l'acheteur reçoit la carte par email (il l'imprime/
 *                 la transmet lui-même) — le bénéficiaire ne reçoit rien,
 *                 même si `recipientEmail` est fourni.
 * - 'recipient' : l'acheteur reçoit une confirmation, le bénéficiaire
 *                 reçoit directement la carte.
 */
export type OnlineGiftCardDeliveryMode = 'buyer' | 'recipient';

/**
 * Suivi de la DISTRIBUTION (email), distinct du statut de la commande :
 * une commande peut être `issued` (carte créée) alors que sa distribution
 * est encore `pending`/`sending`, ou a échoué (`failed`) — un échec d'envoi
 * ne remet jamais en cause le paiement ni la carte. `sending` est un état
 * transitoire servant de verrou d'unicité (voir
 * lib/services/online-gift-card-delivery.ts) ; `sent` n'est plus jamais
 * réclamable (pas de double envoi) ; `failed` reste réclamable par un futur
 * essai (rejeu webhook, ou plus tard un bouton « Renvoyer »).
 */
export type OnlineGiftCardDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface OnlineGiftCardOrder {
  id: string;
  organizationId: string;
  publicReference: string;
  amountCents: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  recipientName: string;
  /** Facultatif si `deliveryMode === 'buyer'` (carte imprimée/remise en main propre). */
  recipientEmail: string | null;
  message: string | null;
  status: OnlineGiftCardOrderStatus;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  giftCardId: string | null;
  idempotencyKey: string | null;
  requestFingerprint: string | null;
  deliveryMode: OnlineGiftCardDeliveryMode;
  deliveryStatus: OnlineGiftCardDeliveryStatus;
  deliveryAttemptedAt: string | null;
  deliverySentAt: string | null;
  deliveryError: string | null;
}

/** Exportés pour lib/services/online-gift-card-fulfillment.ts (webhook,
 *  étape 4), qui lit/mappe des lignes de la même table via un client de
 *  transaction propre (verrouillage de ligne) plutôt que via ce module. */
export interface OrderRow {
  id: string; organization_id: string; public_reference: string;
  amount_cents: number; currency: string;
  buyer_name: string; buyer_email: string;
  recipient_name: string; recipient_email: string | null;
  message: string | null;
  status: OnlineGiftCardOrderStatus;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  gift_card_id: string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
  delivery_mode: OnlineGiftCardDeliveryMode;
  delivery_status: OnlineGiftCardDeliveryStatus;
  delivery_attempted_at: string | null;
  delivery_sent_at: string | null;
  delivery_error: string | null;
}

export function mapRow(r: OrderRow): OnlineGiftCardOrder {
  return {
    id: r.id,
    organizationId: r.organization_id,
    publicReference: r.public_reference,
    amountCents: r.amount_cents,
    currency: r.currency,
    buyerName: r.buyer_name,
    buyerEmail: r.buyer_email,
    recipientName: r.recipient_name,
    recipientEmail: r.recipient_email,
    message: r.message,
    status: r.status,
    stripeCheckoutSessionId: r.stripe_checkout_session_id,
    stripePaymentIntentId: r.stripe_payment_intent_id,
    giftCardId: r.gift_card_id,
    idempotencyKey: r.idempotency_key,
    requestFingerprint: r.request_fingerprint,
    deliveryMode: r.delivery_mode,
    deliveryStatus: r.delivery_status,
    deliveryAttemptedAt: r.delivery_attempted_at,
    deliverySentAt: r.delivery_sent_at,
    deliveryError: r.delivery_error,
  };
}

/** Référence publique : non séquentielle, distincte de l'id interne (uuid). */
function generatePublicReference(): string {
  return `GC-${randomBytes(5).toString('hex').toUpperCase().slice(0, 8)}`;
}

/**
 * Empreinte d'une tentative : sert à détecter qu'une clé d'idempotence est
 * réutilisée avec un contenu DIFFÉRENT (conflit à refuser) plutôt que rejouée
 * à l'identique (double-clic, retry réseau — à traiter comme la même
 * tentative). N'inclut PAS la clé d'idempotence elle-même ni l'IP.
 */
export function computeRequestFingerprint(input: {
  amountCents: number; buyerName: string; buyerEmail: string;
  recipientName: string; recipientEmail: string | null; message: string | null;
  deliveryMode: OnlineGiftCardDeliveryMode;
}): string {
  const normalized = JSON.stringify([
    input.amountCents,
    input.buyerName.trim().toLowerCase(),
    input.buyerEmail.trim().toLowerCase(),
    input.recipientName.trim().toLowerCase(),
    (input.recipientEmail ?? '').trim().toLowerCase(),
    (input.message ?? '').trim(),
    input.deliveryMode,
  ]);
  return createHash('sha256').update(normalized).digest('hex');
}

/** Levée quand deux requêtes concurrentes visent la même clé d'idempotence :
 *  l'appelant doit relire la ligne existante plutôt que réessayer en boucle. */
export class IdempotencyRaceError extends Error {
  constructor() {
    super('Une tentative avec cette clé est déjà en cours de création.');
    this.name = 'IdempotencyRaceError';
  }
}

export interface CreatePendingOrderArgs {
  organizationId: string;
  amountCents: number;
  buyerName: string;
  buyerEmail: string;
  recipientName: string;
  /** Obligatoire seulement si `deliveryMode === 'recipient'` (validé en amont par la route). */
  recipientEmail: string | null;
  message: string | null;
  deliveryMode: OnlineGiftCardDeliveryMode;
  idempotencyKey: string | null;
  requestFingerprint: string | null;
  clientIp: string | null;
}

/**
 * Crée la tentative en 'pending', AVANT tout appel Stripe. Réessaie sur
 * collision de référence publique (même idiome que GiftCardService.create :
 * générer, vérifier via la contrainte UNIQUE, réessayer — 5 tentatives,
 * collision astronomiquement improbable en pratique).
 */
export async function createPendingOrder(args: CreatePendingOrderArgs): Promise<OnlineGiftCardOrder> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generatePublicReference();
    try {
      const { rows } = await query<OrderRow>(
        `INSERT INTO online_gift_card_orders
           (organization_id, public_reference, amount_cents, currency,
            buyer_name, buyer_email, recipient_name, recipient_email, message,
            delivery_mode, status, idempotency_key, request_fingerprint, client_ip)
         VALUES ($1,$2,$3,'eur',$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12)
         RETURNING *`,
        [
          args.organizationId, reference, args.amountCents,
          args.buyerName, args.buyerEmail, args.recipientName, args.recipientEmail, args.message,
          args.deliveryMode, args.idempotencyKey, args.requestFingerprint, args.clientIp,
        ],
      );
      return mapRow(rows[0]!);
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23505') {
        if (pgErr.constraint === 'idx_online_gift_card_orders_org_idempotency') {
          throw new IdempotencyRaceError();
        }
        continue; // collision sur public_reference : réessaie avec une nouvelle référence
      }
      throw err;
    }
  }
  throw new Error('PUBLIC_REFERENCE_GENERATION_FAILED');
}

export async function findOrderByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
): Promise<OnlineGiftCardOrder | null> {
  const { rows } = await query<OrderRow>(
    `SELECT * FROM online_gift_card_orders WHERE organization_id = $1 AND idempotency_key = $2`,
    [organizationId, idempotencyKey],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function markOrderSessionCreated(orderId: string, stripeSessionId: string): Promise<void> {
  await query(
    `UPDATE online_gift_card_orders SET stripe_checkout_session_id = $2, updated_at = now() WHERE id = $1`,
    [orderId, stripeSessionId],
  );
}

/** N'échoue jamais une ligne qui a avancé entre-temps (ex. déjà payée). */
export async function markOrderFailed(orderId: string): Promise<void> {
  await query(
    `UPDATE online_gift_card_orders SET status = 'failed', updated_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [orderId],
  );
}

/**
 * Limitation de débit — PERSISTÉE en base (pas un compteur en mémoire local :
 * inutilisable ici, l'app tourne en fonctions serverless multi-instances où
 * chaque instance aurait son propre compteur). Volontairement simple
 * (fenêtre glissante approximative par COUNT sur la dernière minute, pas de
 * seau à jetons) : suffisant pour éviter l'abus grossier de cet endpoint
 * public créateur d'objets Stripe, structuré pour qu'un futur limiteur plus
 * fin (ex. Redis/Upstash à seau à jetons) puisse remplacer `isRateLimited`
 * sans toucher à l'appelant.
 */
const MAX_ATTEMPTS_PER_ORG_PER_MINUTE = 30;
const MAX_ATTEMPTS_PER_IP_PER_MINUTE = 5;

export async function isRateLimited(organizationId: string, clientIp: string | null): Promise<boolean> {
  const orgCount = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM online_gift_card_orders
      WHERE organization_id = $1 AND created_at > now() - interval '1 minute'`,
    [organizationId],
  );
  if (Number(orgCount.rows[0]?.n ?? '0') >= MAX_ATTEMPTS_PER_ORG_PER_MINUTE) return true;

  if (clientIp) {
    const ipCount = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM online_gift_card_orders
        WHERE client_ip = $1 AND created_at > now() - interval '1 minute'`,
      [clientIp],
    );
    if (Number(ipCount.rows[0]?.n ?? '0') >= MAX_ATTEMPTS_PER_IP_PER_MINUTE) return true;
  }
  return false;
}

/** IP publique de l'appelant, telle que transmise par le proxy Vercel. */
export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim() || null;
  return req.headers.get('x-real-ip');
}
