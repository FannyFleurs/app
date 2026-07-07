/**
 * Comptes comptables utilises dans les exports (ecritures + FEC-like).
 *
 * Modifiable par organisation dans /exports, pour coller au plan
 * comptable du comptable. Stocke sous la cle `accounting_accounts`
 * dans la table settings.
 */

export interface AccountingAccounts {
  sales:     string;  // Ventes de marchandises
  tva_20:    string;  // TVA collectée 20 %
  tva_10:    string;  // TVA collectée 10 %
  tva_55:    string;  // TVA collectée 5,5 %
  tva_21:    string;  // TVA collectée 2,1 %
  clients:   string;  // Clients (créances)
  cash:      string;  // Caisse — espèces
  bank:      string;  // Banque (CB, virement, chèque)
  discounts: string;  // Remises accordées
}

export const ACCOUNTING_ACCOUNTS_KEY = 'accounting_accounts';

export const ACCOUNTING_ACCOUNTS_DEFAULTS: AccountingAccounts = {
  sales:     '707000',
  tva_20:    '445710',
  tva_10:    '445711',
  tva_55:    '445712',
  tva_21:    '445713',
  clients:   '411000',
  cash:      '530000',
  bank:      '512000',
  discounts: '709000',
};

export function mergeAccountingAccounts(
  partial: Partial<AccountingAccounts> | null | undefined,
): AccountingAccounts {
  return { ...ACCOUNTING_ACCOUNTS_DEFAULTS, ...(partial ?? {}) };
}

/** Choisit le compte TVA correspondant a un taux (en %). */
export function tvaAccountForRate(
  accts: AccountingAccounts,
  ratePct: number,
): string {
  if (ratePct === 20)   return accts.tva_20;
  if (ratePct === 10)   return accts.tva_10;
  if (Math.abs(ratePct - 5.5) < 0.01) return accts.tva_55;
  if (Math.abs(ratePct - 2.1) < 0.01) return accts.tva_21;
  return accts.tva_20; // fallback : TVA 20 % (le plus courant)
}
