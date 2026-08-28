/**
 * Paramétrage du ticket de caisse — en-tête, pied de page, options d'impression.
 * Stocké dans la table `settings` sous la clé `receipt`.
 */

export const RECEIPT_KEY = 'receipt';

/**
 * Clé de stockage du paramétrage ticket pour une boutique donnée.
 * Chaque boutique a son propre ticket : `receipt:<storeId>`. La clé
 * historique `receipt` (sans boutique) sert de modèle par défaut / repli
 * tant qu'une boutique n'a pas enregistré sa propre configuration.
 */
export function receiptKey(storeId?: string | null): string {
  return storeId ? `${RECEIPT_KEY}:${storeId}` : RECEIPT_KEY;
}

export interface ReceiptSettings {
  /** Logo en data URL (PNG/JPG, max ~50 kB recommandé). Vide = pas de logo. */
  logo_data_url: string;
  /** Nom commercial affiché en haut du ticket. Si vide, on prend le nom de la société. */
  shop_name: string;
  /** Adresse postale, ligne 1. */
  address_line1: string;
  /** Code postal + ville. */
  address_zip_city: string;
  /** Téléphone. */
  phone: string;
  /** SIRET. */
  siret: string;
  /** N° TVA intra-communautaire. */
  vat_number: string;
  /** Site web de la boutique (propre à chaque boutique). Affiché en en-tête. */
  website: string;
  /** Message de remerciement affiché TOUT EN BAS du ticket (1 ligne). */
  welcome_message: string;
  /** Message de pied de page (plusieurs lignes possibles). */
  footer_message: string;
  /** Imprime le code-barres Code-128 du numéro de ticket. */
  show_barcode: boolean;
  /** Imprime le détail de TVA. */
  show_tax_breakdown: boolean;
  /** Après chaque vente validée, ouvre le PDF du ticket en impression directe. */
  auto_print_receipt: boolean;
  /** À la clôture journalière (Z), imprime automatiquement le Z. */
  auto_print_z: boolean;
  /**
   * Type d'imprimante ticket de LA boutique. Détermine par quel chemin sort le
   * ticket, sans ambiguïté :
   *  - 'cloudprnt' : imprimante Star CloudPRNT (réseau, pilotée par le serveur).
   *    Fonctionne au navigateur/PWA comme dans l'app.
   *  - 'ip' : imprimante réseau ESC/POS (IP:port), pilotée par l'application
   *    native iOS/Android uniquement.
   * Défaut 'cloudprnt' : les boutiques déjà configurées ne changent pas.
   */
  printer_type: 'cloudprnt' | 'ip';
  /**
   * Nombre d'exemplaires imprimés d'un avoir sur l'imprimante ticket, lors
   * d'une reprise de produit. 2 par défaut (un pour le client, un pour la
   * boutique). 0 = ne pas imprimer automatiquement.
   */
  credit_note_copies: number;
}

export const RECEIPT_DEFAULTS: ReceiptSettings = {
  logo_data_url: '',
  shop_name: '',
  address_line1: '',
  address_zip_city: '',
  phone: '',
  siret: '',
  vat_number: '',
  website: '',
  welcome_message: 'Merci de votre visite',
  footer_message: 'À bientôt !',
  show_barcode: true,
  show_tax_breakdown: true,
  auto_print_receipt: false,
  auto_print_z: false,
  printer_type: 'cloudprnt',
  credit_note_copies: 2,
};

/** Nombre d'exemplaires d'avoir, borné (0 à 5) et entier. */
export function creditNoteCopies(settings: Pick<ReceiptSettings, 'credit_note_copies'>): number {
  const n = Math.round(Number(settings.credit_note_copies));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(5, n);
}

export function mergeReceiptDefaults(partial: Partial<ReceiptSettings> | null | undefined): ReceiptSettings {
  if (!partial) return { ...RECEIPT_DEFAULTS };
  const out = { ...RECEIPT_DEFAULTS };
  for (const k of Object.keys(RECEIPT_DEFAULTS) as (keyof ReceiptSettings)[]) {
    if (partial[k] !== undefined) {
      // @ts-expect-error merge homogène
      out[k] = partial[k];
    }
  }
  return out;
}
