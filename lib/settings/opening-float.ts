/**
 * Fond de caisse à l'ouverture — désormais paramétrable PAR BOUTIQUE.
 *
 * Historiquement stocké dans le bloc `pos_ui` (champs opening_float_mode /
 * opening_float_amount). On introduit une clé dédiée `opening_float`, déclinée
 * par boutique (`opening_float:<storeId>`), avec repli sur la valeur pos_ui
 * existante tant qu'aucune boutique n'a défini la sienne (voir
 * opening-float-server.ts).
 */
import { OPENING_FLOAT_MODES, type OpeningFloatMode } from './pos-ui';

export const OPENING_FLOAT_KEY = 'opening_float';

export interface OpeningFloatSettings {
  mode: OpeningFloatMode;
  amount: number;
}

export const OPENING_FLOAT_SETTINGS_DEFAULTS: OpeningFloatSettings = {
  mode: 'manual',
  amount: 0,
};

export function mergeOpeningFloat(
  partial: Partial<OpeningFloatSettings> | null | undefined,
): OpeningFloatSettings {
  if (!partial) return { ...OPENING_FLOAT_SETTINGS_DEFAULTS };
  const mode = (OPENING_FLOAT_MODES as readonly string[]).includes(partial.mode ?? '')
    ? (partial.mode as OpeningFloatMode)
    : OPENING_FLOAT_SETTINGS_DEFAULTS.mode;
  const amount = typeof partial.amount === 'number' && partial.amount >= 0
    ? partial.amount
    : OPENING_FLOAT_SETTINGS_DEFAULTS.amount;
  return { mode, amount };
}
