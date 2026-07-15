import 'server-only';
import { query } from '@/lib/db/client';
import { loadScopedSettingValue } from './scoped-server';
import {
  OPENING_FLOAT_KEY,
  mergeOpeningFloat,
  type OpeningFloatSettings,
} from './opening-float';
import { POS_UI_KEY, mergeWithDefaults, type PosUiSettings } from './pos-ui';

/**
 * Fond de caisse effectif pour une boutique.
 *
 * Priorité : clé `opening_float:<storeId>` → clé `opening_float` (org) →
 * repli sur les champs historiques du bloc `pos_ui` (opening_float_mode /
 * opening_float_amount) → valeurs par défaut. Le repli pos_ui garantit qu'on
 * conserve la configuration existante tant qu'aucune boutique n'a défini la
 * sienne.
 */
export async function loadOpeningFloat(
  organizationId: string,
  storeId?: string | null,
): Promise<OpeningFloatSettings> {
  const scoped = await loadScopedSettingValue<OpeningFloatSettings>(
    organizationId, OPENING_FLOAT_KEY, storeId,
  );
  if (scoped && scoped.mode !== undefined) return mergeOpeningFloat(scoped);

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, POS_UI_KEY],
  );
  const pos = mergeWithDefaults(rows[0]?.value ?? null);
  return mergeOpeningFloat({ mode: pos.opening_float_mode, amount: pos.opening_float_amount });
}
