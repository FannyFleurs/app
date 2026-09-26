import { escapeHtml } from './platform';

/**
 * Rendu HTML de la carte cadeau — partagé par tous les emails de
 * distribution (étape 5) et réutilisable plus tard par une page web
 * (« Imprimer ma carte ») ou un export PDF éventuel. Toute évolution
 * visuelle du bloc carte doit passer par cette seule fonction : ne PAS
 * dupliquer ce balisage ailleurs.
 *
 * Suffisamment sobre pour être imprimé (fond blanc, contraste correct en
 * niveaux de gris) : le mode `delivery_mode = "buyer"` compte explicitement
 * sur l'impression/le transfert de cet email par l'acheteur.
 */
export interface GiftCardBlockArgs {
  organizationName: string;
  /** Déjà formaté (ex. "50,00 €") — voir lib/services/money.ts::formatEUR. */
  amountLabel: string;
  /** Titulaire de la carte : toujours recipient.name, jamais buyer.name. */
  holderName: string;
  /** Code RÉEL de la gift_card émise — jamais une référence de commande/session. */
  code: string;
  message?: string | null;
}

export function renderGiftCardCardHtml(args: GiftCardBlockArgs): string {
  const { organizationName, amountLabel, holderName, code, message } = args;
  const messageBlock = message
    ? `<div style="margin-top:12px;font-size:14px;color:#333333;font-style:italic;">« ${escapeHtml(message)} »</div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" `
    + `style="max-width:480px;margin:24px 0;border:2px solid #2f6f4f;border-radius:12px;`
    + `overflow:hidden;font-family:Arial,Helvetica,sans-serif;">`
    + `<tr><td style="background:#2f6f4f;color:#ffffff;padding:16px 24px;">`
    + `<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.85;">`
    + `${escapeHtml(organizationName)}</div>`
    + `<div style="font-size:20px;font-weight:bold;margin-top:4px;">Carte cadeau</div>`
    + `</td></tr>`
    + `<tr><td style="padding:24px;background:#ffffff;">`
    + `<div style="font-size:32px;font-weight:bold;color:#2f6f4f;">${escapeHtml(amountLabel)}</div>`
    + `<div style="margin-top:12px;font-size:14px;color:#333333;">Au nom de `
    + `<strong>${escapeHtml(holderName)}</strong></div>`
    + messageBlock
    + `<div style="margin-top:20px;padding:12px 16px;background:#f3f7f4;border-radius:8px;text-align:center;">`
    + `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666666;">Code de la carte</div>`
    + `<div style="font-size:22px;font-weight:bold;letter-spacing:2px;margin-top:4px;">${escapeHtml(code)}</div>`
    + `</div>`
    + `<div style="margin-top:16px;font-size:12px;color:#666666;">`
    + `Cette carte cadeau est utilisable dans les boutiques ${escapeHtml(organizationName)}. `
    + `Présentez ce code en caisse (imprimé ou depuis votre téléphone).`
    + `</div>`
    + `</td></tr></table>`;
}

export interface GiftCardEmailArgs extends GiftCardBlockArgs {
  /** Personne à qui s'adresse cet email (peut être le buyer OU le recipient). */
  greetingName: string;
}

/**
 * Email contenant la carte (code réel inclus) — utilisé pour :
 * - `delivery_mode = "buyer"` (destinataire : buyer) ;
 * - `delivery_mode = "recipient"` (destinataire : recipient) ;
 * - emails buyer/recipient identiques (un seul envoi combiné).
 */
export function buildGiftCardEmailHtml(args: GiftCardEmailArgs): string {
  const { greetingName, organizationName } = args;
  return `<p>Bonjour ${escapeHtml(greetingName)},</p>`
    + `<p>Merci pour cet achat ! Voici votre carte cadeau ${escapeHtml(organizationName)}.</p>`
    + renderGiftCardCardHtml(args)
    + `<p>Vous pouvez imprimer cet email ou le transférer : la carte est valable dès maintenant.</p>`;
}

export interface BuyerConfirmationArgs {
  organizationName: string;
  amountLabel: string;
  /** Titulaire de la carte (recipient), affiché sans jamais montrer le code. */
  holderName: string;
  reference: string;
  buyerName: string;
}

/**
 * Confirmation d'achat SANS le code — envoyée au buyer en `delivery_mode =
 * "recipient"` lorsque buyer.email ≠ recipient.email (sinon un seul email
 * combiné est envoyé via `buildGiftCardEmailHtml`, jamais celle-ci).
 */
export function buildBuyerConfirmationOnlyEmailHtml(args: BuyerConfirmationArgs): string {
  const { organizationName, amountLabel, holderName, reference, buyerName } = args;
  return `<p>Bonjour ${escapeHtml(buyerName)},</p>`
    + `<p>Merci pour votre achat ! Votre carte cadeau ${escapeHtml(organizationName)} d'un montant de `
    + `<strong>${escapeHtml(amountLabel)}</strong> (référence ${escapeHtml(reference)}) a bien été envoyée `
    + `par email à <strong>${escapeHtml(holderName)}</strong>.</p>`
    + `<p>Merci pour votre confiance.</p>`;
}
