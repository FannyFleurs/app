import { scopedSettingKey } from './scoped';
import { DEFAULT_PAYMENT_TERM } from './payment-terms';

/**
 * Paramétrage facturation par boutique : coordonnées bancaires (RIB) affichées
 * sur la facture et conditions de règlement par défaut. Isomorphe (nommage de
 * clé + valeurs par défaut), pas d'accès base ici.
 */
export const INVOICE_SETTINGS_KEY = 'invoice';

export interface InvoiceSettings {
  /** Affiche le bloc « Coordonnées bancaires » sur la facture. */
  show_bank_details: boolean;
  bank_holder: string; // Titulaire du compte
  bank_name: string;   // Banque
  bank_iban: string;
  bank_bic: string;
  /** Conditions de règlement par défaut (code) si le client n'en a pas. */
  default_payment_terms: string;
}

export function invoiceSettingsKey(storeId?: string | null): string {
  return scopedSettingKey(INVOICE_SETTINGS_KEY, storeId);
}

export function mergeInvoiceDefaults(v: Partial<InvoiceSettings> | null): InvoiceSettings {
  return {
    show_bank_details: v?.show_bank_details ?? false,
    bank_holder: v?.bank_holder ?? '',
    bank_name: v?.bank_name ?? '',
    bank_iban: v?.bank_iban ?? '',
    bank_bic: v?.bank_bic ?? '',
    default_payment_terms: v?.default_payment_terms ?? DEFAULT_PAYMENT_TERM,
  };
}
