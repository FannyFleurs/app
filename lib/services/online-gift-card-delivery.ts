import 'server-only';
import { query } from '@/lib/db/client';
import { sendOrgEmail } from '@/lib/email/send';
import { formatEUR } from './money';
import {
  buildGiftCardEmailHtml, buildBuyerConfirmationOnlyEmailHtml,
} from '@/lib/email/gift-card-template';

/**
 * Distribution par email de la carte cadeau (étape 5), après émission
 * réussie (`fulfillOnlineGiftCardCheckout`, étape 4 — jamais avant, jamais
 * depuis `success_url`). Le TITULAIRE de la carte (`recipient`) reste
 * inchangé ; ce module décide seulement QUI reçoit l'email selon
 * `delivery_mode`, persisté sur la commande — jamais recalculé depuis les
 * metadata Stripe.
 *
 * Appelé APRÈS le COMMIT de la transaction d'émission, jamais dedans :
 * l'envoi réseau (fournisseur email) ne doit jamais retenir une connexion/
 * verrou Postgres pendant potentiellement plusieurs secondes. Un échec
 * d'envoi ne remet donc jamais en cause le paiement ni la carte déjà créée
 * — seul `delivery_status` en garde la trace (voir migration 0082).
 */

interface DeliveryOrderRow {
  id: string;
  organization_id: string;
  public_reference: string;
  amount_cents: number;
  buyer_name: string;
  buyer_email: string;
  recipient_name: string;
  recipient_email: string | null;
  message: string | null;
  delivery_mode: 'buyer' | 'recipient';
  gift_card_id: string | null;
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

/**
 * Réclame la distribution d'une commande émise, envoie le ou les email(s)
 * appropriés, puis enregistre le résultat. Idempotent par CLAIM atomique :
 * seule une commande `status = 'issued'` ET `delivery_status IN ('pending',
 * 'failed')` est réclamable — un appel concurrent (webhook rejoué en
 * parallèle) voit alors `rowCount = 0` et s'arrête sans envoyer de second
 * email. `'failed'` reste réclamable (un rejeu ultérieur du webhook peut
 * donc réussir un envoi précédemment en échec) ; `'sent'`/`'sending'` ne le
 * sont plus jamais — pas de double envoi, pas d'interface « Renvoyer »
 * nécessaire à ce stade pour ce cas précis.
 *
 * Ne fait rien (silencieusement) si la commande n'existe pas, n'est pas
 * `issued`, ou est déjà en cours/terminée d'un point de vue distribution.
 */
export async function deliverOnlineGiftCardOrder(orderId: string): Promise<void> {
  const claim = await query<DeliveryOrderRow>(
    `UPDATE online_gift_card_orders
        SET delivery_status = 'sending', delivery_attempted_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'issued' AND delivery_status IN ('pending', 'failed')
      RETURNING id, organization_id, public_reference, amount_cents,
                buyer_name, buyer_email, recipient_name, recipient_email,
                message, delivery_mode, gift_card_id`,
    [orderId],
  );
  const order = claim.rows[0];
  if (!order || !order.gift_card_id) return;

  try {
    const info = await query<{ code: string; organization_name: string }>(
      `SELECT g.code, o.name AS organization_name
         FROM gift_cards g
         JOIN organizations o ON o.id = g.organization_id
        WHERE g.id = $1`,
      [order.gift_card_id],
    );
    const gc = info.rows[0];
    if (!gc) throw new Error('GIFT_CARD_NOT_FOUND');

    const amountLabel = formatEUR(order.amount_cents / 100);
    const buyerEmail = normalizeEmail(order.buyer_email);
    const recipientEmail = order.recipient_email ? normalizeEmail(order.recipient_email) : null;
    // Emails identiques (après normalisation) : UN SEUL email combiné,
    // quel que soit delivery_mode — jamais de doublon.
    const sameEmail = recipientEmail !== null && recipientEmail === buyerEmail;

    const sends: Promise<{ ok: boolean; error?: string }>[] = [];

    if (order.delivery_mode === 'buyer' || sameEmail) {
      // Mode buyer : SEUL l'acheteur reçoit la carte, jamais le
      // bénéficiaire — même si recipient.email est renseigné (règle
      // impérative, non négociable). Emails identiques en mode recipient :
      // un seul envoi combiné plutôt que deux emails vers la même adresse.
      sends.push(sendOrgEmail({
        organizationId: order.organization_id,
        storeId: null, // pas de notion de boutique pour une carte en ligne
        to: order.buyer_email,
        toName: order.buyer_name,
        subject: `Votre carte cadeau ${gc.organization_name}`,
        html: buildGiftCardEmailHtml({
          organizationName: gc.organization_name,
          amountLabel,
          holderName: order.recipient_name,
          code: gc.code,
          message: order.message,
          greetingName: order.buyer_name,
        }),
      }));
    } else {
      // Mode recipient, emails distincts : confirmation SANS code au buyer,
      // carte réelle (code inclus) au recipient.
      sends.push(sendOrgEmail({
        organizationId: order.organization_id,
        storeId: null,
        to: order.buyer_email,
        toName: order.buyer_name,
        subject: `Confirmation d'achat — carte cadeau ${gc.organization_name}`,
        html: buildBuyerConfirmationOnlyEmailHtml({
          organizationName: gc.organization_name,
          amountLabel,
          holderName: order.recipient_name,
          reference: order.public_reference,
          buyerName: order.buyer_name,
        }),
      }));
      sends.push(sendOrgEmail({
        organizationId: order.organization_id,
        storeId: null,
        to: order.recipient_email!,
        toName: order.recipient_name,
        subject: `${gc.organization_name} vous offre une carte cadeau !`,
        html: buildGiftCardEmailHtml({
          organizationName: gc.organization_name,
          amountLabel,
          holderName: order.recipient_name,
          code: gc.code,
          message: order.message,
          greetingName: order.recipient_name,
        }),
      }));
    }

    const results = await Promise.all(sends);
    const failed = results.find((r) => !r.ok);
    if (failed) {
      // Code d'erreur COURT uniquement (ex. "PROVIDER_ERROR") : jamais de
      // détail technique/sensible dans delivery_error — voir migration 0082.
      await query(
        `UPDATE online_gift_card_orders
            SET delivery_status = 'failed', delivery_error = $2, updated_at = now()
          WHERE id = $1`,
        [orderId, (failed.error ?? 'PROVIDER_ERROR').slice(0, 100)],
      );
      return;
    }
    await query(
      `UPDATE online_gift_card_orders
          SET delivery_status = 'sent', delivery_sent_at = now(), delivery_error = NULL, updated_at = now()
        WHERE id = $1`,
      [orderId],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[gift-cards.delivery]', orderId, err);
    await query(
      `UPDATE online_gift_card_orders
          SET delivery_status = 'failed', delivery_error = $2, updated_at = now()
        WHERE id = $1`,
      [orderId, 'DELIVERY_ERROR'],
    ).catch(() => { /* la carte et le paiement restent valides même si l'échec ne peut pas être enregistré */ });
  }
}
