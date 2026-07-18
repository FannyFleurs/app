/**
 * Configuration de l'envoi d'emails transactionnels (factures, tickets…).
 * Fournisseur : Brevo (ex-Sendinblue), API transactionnelle.
 * Stockée dans la table `settings` au niveau organisation, clé `email`.
 * Réservée au back-office.
 */
export const EMAIL_KEY = 'email';

/**
 * Clé de stockage de la config email pour une boutique donnée.
 * `email:<storeId>` si une boutique est précisée, sinon la clé
 * historique au niveau organisation (`email`), qui sert de repli.
 */
export function emailKey(storeId?: string | null): string {
  return storeId ? `${EMAIL_KEY}:${storeId}` : EMAIL_KEY;
}

export interface EmailSettings {
  enabled: boolean;
  provider: 'brevo';
  /** Clé API Brevo (v3). Secrète : jamais renvoyée en clair au navigateur. */
  api_key: string;
  /** Expéditeur (doit être un expéditeur validé dans Brevo). */
  sender_email: string;
  sender_name: string;
  /** Envoi automatique de la facture par email dès sa génération. */
  auto_send_invoice: boolean;
  /** Envoi automatique du ticket par email si le client a une adresse. */
  auto_send_receipt: boolean;
}

export const EMAIL_DEFAULTS: EmailSettings = {
  enabled: false,
  provider: 'brevo',
  api_key: '',
  sender_email: '',
  sender_name: '',
  auto_send_invoice: false,
  auto_send_receipt: false,
};

export function mergeEmailDefaults(partial: Partial<EmailSettings> | null | undefined): EmailSettings {
  return { ...EMAIL_DEFAULTS, ...(partial ?? {}), provider: 'brevo' };
}

/** Masque la clé API pour l'affichage (ne garde que les derniers caractères). */
export function maskApiKey(key: string): string {
  if (!key) return '';
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}
