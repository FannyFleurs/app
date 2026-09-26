import 'server-only';
import { query } from '@/lib/db/client';
import { sendOrgEmail, type EmailAttachment } from '@/lib/email/send';
import { formatEUR } from './money';
import { renderGiftCardCertificatePdf } from './gift-card-certificate-pdf';
import {
  buildGiftCardNotificationEmailHtml, buildBuyerConfirmationOnlyEmailHtml,
} from '@/lib/email/gift-card-template';

/**
 * Distribution par email de la carte cadeau (étape 5, PDF en pièce jointe
 * depuis la refonte), après émission réussie
 * (`fulfillOnlineGiftCardCheckout`, étape 4 — jamais avant, jamais depuis
 * `success_url`). Le TITULAIRE de la carte (`recipient`) reste inchangé ;
 * ce module décide seulement QUI reçoit l'email (et le PDF) selon
 * `delivery_mode`, persisté sur la commande — jamais recalculé depuis les
 * metadata Stripe.
 *
 * Le PDF (voir lib/services/gift-card-certificate-pdf.ts) devient la
 * représentation DE RÉFÉRENCE de la carte : il est régénéré à la volée
 * depuis les données déjà persistées (gift_cards + online_gift_card_orders)
 * à chaque tentative de distribution — jamais stocké en base ni en storage,
 * puisqu'il est entièrement reconstructible à l'identique.
 *
 * Appelé APRÈS le COMMIT de la transaction d'émission, jamais dedans :
 * l'envoi réseau (fournisseur email) ni la génération PDF ne doivent jamais
 * retenir une connexion/verrou Postgres pendant potentiellement plusieurs
 * secondes. Un échec (PDF ou email) ne remet donc jamais en cause le
 * paiement ni la carte déjà créée — seul `delivery_status` en garde la
 * trace (voir migration 0082), et n'affecte jamais l'idempotence du webhook
 * (celle-ci porte sur l'ÉMISSION de la carte, dans
 * online-gift-card-fulfillment.ts, entièrement indépendante de ce module).
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
 * Nom de fichier lisible pour la pièce jointe : `carte-cadeau-
 * <organisation>-<code>.pdf`. Le nom d'organisation est translittéré
 * (accents retirés) et réduit aux caractères sûrs pour un nom de fichier —
 * une organisation au nom exotique ou hostile ne produit jamais un nom de
 * fichier invalide ou surprenant, jamais vide (repli "carte-cadeau").
 */
function attachmentFileName(organizationName: string, code: string): string {
  const slug = organizationName
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const safeCode = code.replace(/[^A-Za-z0-9]/g, '');
  return `carte-cadeau-${slug || 'organisation'}-${safeCode}.pdf`;
}

/**
 * Réclame la distribution d'une commande émise, génère le PDF de la carte,
 * envoie le ou les email(s) appropriés (PDF joint), puis enregistre le
 * résultat. Idempotent par CLAIM atomique : seule une commande `status =
 * 'issued'` ET `delivery_status IN ('pending', 'failed')` est réclamable —
 * un appel concurrent (webhook rejoué en parallèle) voit alors `rowCount =
 * 0` et s'arrête sans regénérer de PDF ni renvoyer d'email. `'failed'`
 * reste réclamable (un rejeu ultérieur du webhook peut donc réussir un
 * envoi précédemment en échec — PDF ou email) ; `'sent'`/`'sending'` ne le
 * sont plus jamais.
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
    const info = await query<{ code: string; organization_name: string; issued_at: string; expires_at: string | null }>(
      `SELECT g.code, o.name AS organization_name, g.issued_at, g.expires_at
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

    // PDF régénéré depuis les données persistées (gift_cards +
    // online_gift_card_orders) — jamais stocké : voir le commentaire de
    // module. Un échec ici tombe dans le catch ci-dessous : la carte et le
    // paiement restent valides, seule la distribution est marquée en échec
    // (retentable au prochain rejeu du webhook).
    const pdfBuffer = await renderGiftCardCertificatePdf({
      organizationName: gc.organization_name,
      amountCents: order.amount_cents,
      holderName: order.recipient_name,
      code: gc.code,
      message: order.message,
      issuedAt: gc.issued_at,
      expiresAt: gc.expires_at,
    });
    const pdfAttachment: EmailAttachment = { name: attachmentFileName(gc.organization_name, gc.code), content: pdfBuffer };

    const sends: Promise<{ ok: boolean; error?: string }>[] = [];

    if (order.delivery_mode === 'buyer' || sameEmail) {
      // Mode buyer : SEUL l'acheteur reçoit la carte (PDF joint), jamais le
      // bénéficiaire — même si recipient.email est renseigné (règle
      // impérative, non négociable). Emails identiques en mode recipient :
      // un seul envoi combiné plutôt que deux emails vers la même adresse.
      sends.push(sendOrgEmail({
        organizationId: order.organization_id,
        storeId: null, // pas de notion de boutique pour une carte en ligne
        to: order.buyer_email,
        toName: order.buyer_name,
        subject: `Votre carte cadeau ${gc.organization_name}`,
        html: buildGiftCardNotificationEmailHtml({
          organizationName: gc.organization_name,
          amountLabel,
          holderName: order.recipient_name,
          message: order.message,
          greetingName: order.buyer_name,
        }),
        attachments: [pdfAttachment],
      }));
    } else {
      // Mode recipient, emails distincts : confirmation SANS pièce jointe
      // au buyer, carte réelle (PDF joint) au recipient.
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
        html: buildGiftCardNotificationEmailHtml({
          organizationName: gc.organization_name,
          amountLabel,
          holderName: order.recipient_name,
          message: order.message,
          greetingName: order.recipient_name,
        }),
        attachments: [pdfAttachment],
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
    // Code court dédié pour un échec de génération PDF (distinct d'un échec
    // fournisseur email) — utile pour le diagnostic serveur, jamais exposé.
    const errorCode = err instanceof Error && err.message === 'GIFT_CARD_NOT_FOUND' ? 'GIFT_CARD_NOT_FOUND' : 'DELIVERY_ERROR';
    await query(
      `UPDATE online_gift_card_orders
          SET delivery_status = 'failed', delivery_error = $2, updated_at = now()
        WHERE id = $1`,
      [orderId, errorCode],
    ).catch(() => { /* la carte et le paiement restent valides même si l'échec ne peut pas être enregistré */ });
  }
}
