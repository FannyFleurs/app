/**
 * Paramétrage de la gestion d'argent : seuils, alerte plafond,
 * gestion des remises en banque.
 * Stocké dans la table `settings` sous la clé `cash`.
 */

export const CASH_KEY = 'cash';

export interface CashSettings {
  /** Plafond d'espèces en caisse (alerte au-delà). 0 = pas de plafond. */
  cash_cap: number;
  /** Demander confirmation pour les paiements espèces > seuil. 0 = jamais. */
  large_cash_threshold: number;
  /** Active la possibilité de remise en banque pendant la journée. */
  allow_bank_deposit: boolean;
  /** Force au moins une remise en banque par jour. */
  bank_deposit_required: boolean;
  /** Imprime un reçu lors de chaque remise en banque. */
  print_bank_deposit_receipt: boolean;
  /** Fonds de caisse minimum à laisser après remise. */
  minimum_float: number;
}

export const CASH_DEFAULTS: CashSettings = {
  cash_cap: 0,
  large_cash_threshold: 1000,
  allow_bank_deposit: true,
  bank_deposit_required: false,
  print_bank_deposit_receipt: true,
  minimum_float: 0,
};

export function mergeCashDefaults(partial: Partial<CashSettings> | null | undefined): CashSettings {
  if (!partial) return { ...CASH_DEFAULTS };
  const out = { ...CASH_DEFAULTS };
  for (const k of Object.keys(CASH_DEFAULTS) as (keyof CashSettings)[]) {
    if (partial[k] !== undefined) {
      // @ts-expect-error merge homogène
      out[k] = partial[k];
    }
  }
  return out;
}
