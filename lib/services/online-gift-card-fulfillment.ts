import 'server-only';
import { withTransaction, query } from '@/lib/db/client';
import { GiftCardService } from './gift-card-service';
import { mapRow, type OrderRow, type OnlineGiftCardOrder } from './online-gift-card-orders';
import { deliverOnlineGiftCardOrder } from './online-gift-card-delivery';

/**
 * Émission de la carte cadeau HelloPos suite à un paiement Stripe confirmé
 * (étape 4). C'est la SEULE porte d'entrée qui a le droit de faire passer
 * une commande `online_gift_card_orders` à 'issued' et de créer la carte
 * correspondante — appelée exclusivement depuis le webhook Stripe
 * (app/api/webhooks/stripe/route.ts), jamais depuis une route publique/
 * navigateur (success_url ne prouve jamais un paiement).
 *
 * Réutilise le système gift_cards EXISTANT (GiftCardService.create), pas un
 * second moteur : mêmes tables, mêmes règles, mêmes écrans de gestion.
 */

export type FulfillOutcome =
  /** Carte émise à l'appel présent (ou par un appel concurrent désormais
   *  commité — dans les deux cas, la commande finit 'issued' une seule fois). */
  | 'issued'
  /** Idempotence : déjà traitée avant cet appel (webhook rejoué, retry
   *  Stripe, doublon) — aucune seconde carte créée. */
  | 'already_issued'
  | 'order_not_found'
  | 'organization_mismatch'
  | 'session_mismatch'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'not_paid';

export interface FulfillCheckoutArgs {
  /** organization_id lu dans les metadata Stripe — jamais fait confiance
   *  seul, toujours recoupé avec organization_id de la commande persistée. */
  organizationId: string;
  giftCardOrderId: string;
  stripeSessionId: string;
  paymentStatus: string | undefined;
  amountTotalCents: number | null | undefined;
  currency: string | null | undefined;
  paymentIntentId: string | null | undefined;
}

/**
 * Vérifie la cohérence (métadonnées Stripe vs commande persistée) puis émet
 * la carte — le tout dans UNE SEULE transaction avec verrouillage de ligne
 * (`SELECT ... FOR UPDATE`), pour une idempotence réellement concurrent-safe :
 *
 * - Un second appel simultané pour LA MÊME commande (deux webhooks reçus en
 *   parallèle par deux instances serverless, Stripe qui retente) BLOQUE sur
 *   le verrou jusqu'à la fin de la première transaction, puis relit la ligne
 *   à jour ('issued') et s'arrête sans créer de seconde carte.
 * - La création de la carte (GiftCardService.create, avec le CLIENT de
 *   CETTE transaction) et la mise à jour de la commande sont atomiques : un
 *   échec de l'une annule l'autre (aucune carte orpheline si le process
 *   crashe entre les deux).
 * - En complément, une contrainte UNIQUE (migration 0081) sur
 *   online_gift_card_orders.gift_card_id garantit au niveau base qu'une
 *   carte ne peut jamais être rattachée qu'à une seule commande.
 *
 * Ne fait JAMAIS confiance aux seules metadata Stripe : organization_id,
 * l'id de session, le montant et la devise sont recoupés avec la commande
 * persistée avant toute émission.
 *
 * Après COMMIT (jamais dans la transaction — voir
 * lib/services/online-gift-card-delivery.ts), déclenche la DISTRIBUTION par
 * email de la carte (étape 5) : à l'émission fraîche ('issued'), ou en
 * rejeu d'une commande déjà émise dont la distribution n'a pas encore
 * réussi ('already_issued' + organisation/session Stripe toujours
 * cohérentes avec la commande) — ce qui permet à un rejeu webhook Stripe de
 * réessayer un envoi précédemment en échec, SANS jamais recréer de carte
 * (le statut de la commande, lui, ne change plus une fois 'issued').
 */
export async function fulfillOnlineGiftCardCheckout(args: FulfillCheckoutArgs): Promise<FulfillOutcome> {
  const result = await withTransaction(async (client) => {
    const orderRes = await client.query<OrderRow>(
      `SELECT * FROM online_gift_card_orders WHERE id = $1 FOR UPDATE`,
      [args.giftCardOrderId],
    );
    const row = orderRes.rows[0];
    if (!row) return { outcome: 'order_not_found' as const, retryDelivery: false };
    const order: OnlineGiftCardOrder = mapRow(row);

    // Idempotence : commande déjà avancée (par cet appel dans une exécution
    // antérieure, ou par un appel concurrent maintenant commité) — ne
    // JAMAIS émettre de seconde carte pour la même commande. On recoupe
    // quand même organisation + session Stripe (jamais les seules metadata)
    // avant d'autoriser un éventuel réessai de DISTRIBUTION ci-dessous.
    if (order.status !== 'pending') {
      const retryDelivery = order.organizationId === args.organizationId
        && order.stripeCheckoutSessionId === args.stripeSessionId;
      return { outcome: 'already_issued' as const, retryDelivery };
    }

    // --- Cohérence : jamais confiance aux seules metadata Stripe. ---
    if (order.organizationId !== args.organizationId) return { outcome: 'organization_mismatch' as const, retryDelivery: false };
    if (order.stripeCheckoutSessionId !== args.stripeSessionId) return { outcome: 'session_mismatch' as const, retryDelivery: false };
    if ((args.currency ?? '').toLowerCase() !== order.currency.toLowerCase()) return { outcome: 'currency_mismatch' as const, retryDelivery: false };
    if (args.amountTotalCents !== order.amountCents) return { outcome: 'amount_mismatch' as const, retryDelivery: false };
    if (args.paymentStatus !== 'paid') return { outcome: 'not_paid' as const, retryDelivery: false };

    // --- Émission : système gift_cards EXISTANT, dans CETTE transaction. ---
    // RÈGLE MÉTIER IMPÉRATIVE : le titulaire de la carte est le
    // DESTINATAIRE (recipient), jamais l'acheteur (buyer) de la commande
    // en ligne. gift_cards n'a pas de colonne "recipient" dédiée — ses
    // seuls champs de nom/contact libres s'appellent `buyer_name`/
    // `buyer_email` (hérités du flux caisse, où qui achète EST le
    // titulaire) ; pour une carte vendue en ligne, c'est recipient.*
    // qu'on y place, PAS le buyer de online_gift_card_orders. Ce choix ne
    // dépend JAMAIS de delivery_mode (étape 5) : le titulaire reste le
    // recipient que la carte lui soit envoyée directement ou non.
    const { id: giftCardId } = await GiftCardService.create({
      organizationId: order.organizationId,
      userId: null, // émission automatique, aucun utilisateur HelloPos humain
      amount: order.amountCents / 100,
      buyer: { name: order.recipientName, email: order.recipientEmail ?? undefined },
      client,
    });

    await client.query(
      `UPDATE online_gift_card_orders
          SET status = 'issued', gift_card_id = $2, paid_at = now(),
              stripe_payment_intent_id = $3, updated_at = now()
        WHERE id = $1`,
      [order.id, giftCardId, args.paymentIntentId ?? null],
    );

    return { outcome: 'issued' as const, retryDelivery: false };
  });

  if (result.outcome === 'issued' || (result.outcome === 'already_issued' && result.retryDelivery)) {
    await deliverOnlineGiftCardOrder(args.giftCardOrderId);
  }

  return result.outcome;
}

/**
 * Session Stripe expirée sans paiement : marque la commande 'expired' — pas
 * de verrou de ligne nécessaire ici (simple transition à sens unique, gardée
 * par `status = 'pending'` ; si l'émission a entre-temps réussi, cette
 * requête ne fait rien).
 */
export async function markOnlineGiftCardOrderExpired(
  organizationId: string,
  giftCardOrderId: string,
): Promise<void> {
  await query(
    `UPDATE online_gift_card_orders SET status = 'expired', updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'pending'`,
    [giftCardOrderId, organizationId],
  );
}
