import { escapeHtml } from './platform';

/**
 * Emails de distribution de carte cadeau (étape 5, revus pour la carte
 * PDF — voir docs/api-public-gift-cards.md). La carte cadeau PDF (voir
 * lib/services/gift-card-certificate-pdf.ts) est désormais la
 * représentation DE RÉFÉRENCE : ces emails restent volontairement légers,
 * un simple accompagnement de la pièce jointe — ils ne recréent plus la
 * carte en HTML.
 */

export interface GiftCardNotificationEmailArgs {
  organizationName: string;
  /** Personne à qui s'adresse cet email (buyer OU recipient selon le cas). */
  greetingName: string;
  /** Titulaire de la carte : toujours recipient.name, jamais buyer.name. */
  holderName: string;
  /** Déjà formaté (ex. "50,00 €") — voir lib/services/money.ts::formatEUR. */
  amountLabel: string;
  message?: string | null;
}

/**
 * Email principal : accompagne le PDF joint (code réel, montant, mise en
 * page complète — tout est dans la pièce jointe). Utilisé pour
 * `delivery_mode = "buyer"` (destinataire : buyer), `delivery_mode =
 * "recipient"` (destinataire : recipient), et le cas emails identiques (un
 * seul envoi combiné) — dans tous les cas le PDF est joint par l'appelant.
 */
export function buildGiftCardNotificationEmailHtml(args: GiftCardNotificationEmailArgs): string {
  const { organizationName, greetingName, holderName, amountLabel, message } = args;
  const messageBlock = message
    ? `<tr><td style="padding:0 32px 8px;">`
      + `<p style="margin:0;font-size:14px;line-height:1.6;color:#333333;font-style:italic;">« ${escapeHtml(message)} »</p>`
      + `</td></tr>`
    : '';
  return renderEmailShell(organizationName, `
    <tr><td style="padding:32px 32px 4px;">
      <h1 style="margin:0;font-size:20px;color:#14211D;">Votre carte cadeau est prête</h1>
    </td></tr>
    <tr><td style="padding:8px 32px 20px;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:#333333;">
        Bonjour ${escapeHtml(greetingName)}, merci pour cet achat ! Votre carte cadeau ${escapeHtml(organizationName)}
        est disponible en pièce jointe, au format PDF.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F7F4;border-radius:10px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5A625E;">Bénéficiaire</p>
            <p style="margin:0;font-size:15px;font-weight:bold;color:#14211D;">${escapeHtml(holderName)}</p>
          </td>
          <td style="padding:16px 20px;text-align:right;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5A625E;">Montant</p>
            <p style="margin:0;font-size:15px;font-weight:bold;color:#2F6F4F;">${escapeHtml(amountLabel)}</p>
          </td>
        </tr>
      </table>
    </td></tr>
    ${messageBlock}
    <tr><td style="padding:0 32px 24px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#5A625E;">
        Vous pouvez conserver cette pièce jointe, la transférer ou l'imprimer — elle contient le code
        de la carte et toutes les informations utiles pour l'utiliser.
      </p>
    </td></tr>
  `);
}

export interface BuyerConfirmationArgs {
  organizationName: string;
  amountLabel: string;
  /** Titulaire de la carte (recipient) — jamais le code, affiché sans détail sensible. */
  holderName: string;
  reference: string;
  buyerName: string;
}

/**
 * Confirmation d'achat SANS pièce jointe ni code — envoyée au buyer en
 * `delivery_mode = "recipient"` lorsque buyer.email ≠ recipient.email
 * (sinon un seul email combiné est envoyé via
 * `buildGiftCardNotificationEmailHtml`, jamais celle-ci).
 */
export function buildBuyerConfirmationOnlyEmailHtml(args: BuyerConfirmationArgs): string {
  const { organizationName, amountLabel, holderName, reference, buyerName } = args;
  return renderEmailShell(organizationName, `
    <tr><td style="padding:32px 32px 4px;">
      <h1 style="margin:0;font-size:20px;color:#14211D;">Votre achat est confirmé</h1>
    </td></tr>
    <tr><td style="padding:8px 32px 20px;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:#333333;">
        Bonjour ${escapeHtml(buyerName)}, merci pour votre achat ! Votre carte cadeau ${escapeHtml(organizationName)}
        d'un montant de <strong>${escapeHtml(amountLabel)}</strong> (référence ${escapeHtml(reference)})
        a bien été envoyée par email à <strong>${escapeHtml(holderName)}</strong>.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 24px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#5A625E;">Merci pour votre confiance.</p>
    </td></tr>
  `);
}

/** Structure commune (en-tête organisation + pied de page) — sobre, responsive,
 *  compatible avec les principaux clients mail (tables, styles inline). */
function renderEmailShell(organizationName: string, bodyRows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F0;padding:24px 0;">`
    + `<tr><td align="center">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">`
    + `<tr><td style="padding:24px 32px 0;">`
    + `<p style="margin:0;font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:#2F6F4F;">${escapeHtml(organizationName)}</p>`
    + `</td></tr>`
    + bodyRows
    + `<tr><td style="padding:20px 32px 28px;border-top:1px solid #E7E3D8;">`
    + `<p style="margin:0;font-size:12px;color:#5A625E;">L'équipe ${escapeHtml(organizationName)}</p>`
    + `</td></tr>`
    + `</table>`
    + `</td></tr>`
    + `</table>`;
}
