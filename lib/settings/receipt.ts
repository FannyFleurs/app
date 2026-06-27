/**
 * Paramétrage du ticket de caisse — en-tête, pied de page, options d'impression.
 * Stocké dans la table `settings` sous la clé `receipt`.
 */

export const RECEIPT_KEY = 'receipt';

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
  /** Message de bienvenue affiché juste sous l'entête (1 ligne). */
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
}

export const RECEIPT_DEFAULTS: ReceiptSettings = {
  logo_data_url: '',
  shop_name: '',
  address_line1: '',
  address_zip_city: '',
  phone: '',
  siret: '',
  vat_number: '',
  welcome_message: 'Merci de votre visite',
  footer_message: 'À bientôt !',
  show_barcode: true,
  show_tax_breakdown: true,
  auto_print_receipt: false,
  auto_print_z: false,
};

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
