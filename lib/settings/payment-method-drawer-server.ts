import 'server-only';
import { query } from '@/lib/db/client';
import { loadScopedSettingValue } from './scoped-server';
import { scopedSettingKey } from './scoped';
import {
  PAYMENT_METHOD_DRAWER_KEY,
  mergePaymentMethodDrawerMap,
  type PaymentMethodDrawerMap,
} from './payment-method-drawer';

/**
 * Overrides propres à UNE boutique (clé `payment_method_drawer:<storeId>`
 * uniquement — jamais de repli sur une clé organisation sans boutique : il
 * n'existe pas de « défaut organisation » à ce niveau, seulement la valeur
 * historique de payment_methods.opens_drawer, voir
 * loadEffectivePaymentMethodDrawerMap ci-dessous).
 */
export async function loadPaymentMethodDrawerOverrides(
  organizationId: string,
  storeId: string,
): Promise<PaymentMethodDrawerMap> {
  const raw = await loadScopedSettingValue<Record<string, unknown>>(
    organizationId, PAYMENT_METHOD_DRAWER_KEY, storeId,
  );
  return mergePaymentMethodDrawerMap(raw);
}

export async function savePaymentMethodDrawerOverride(args: {
  organizationId: string;
  storeId: string;
  code: string;
  opensDrawer: boolean;
  updatedBy: string | null;
}): Promise<PaymentMethodDrawerMap> {
  const existing = await loadPaymentMethodDrawerOverrides(args.organizationId, args.storeId);
  const merged: PaymentMethodDrawerMap = { ...existing, [args.code]: args.opensDrawer };
  const key = scopedSettingKey(PAYMENT_METHOD_DRAWER_KEY, args.storeId);
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [args.organizationId, key, JSON.stringify(merged), args.updatedBy],
  );
  return merged;
}

/**
 * Carte EFFECTIVE { code -> ouvre le tiroir } pour TOUS les modes de
 * règlement de l'organisation, pour UNE boutique donnée.
 *
 * Priorité : override de la boutique > valeur historique de
 * payment_methods.opens_drawer (seule source avant ce paramétrage par
 * boutique — sert de valeur de départ tant qu'une boutique n'a pas
 * personnalisé la sienne). Sans storeId, renvoie uniquement les valeurs
 * historiques (vue organisation, utilisée en dernier repli).
 */
export async function loadEffectivePaymentMethodDrawerMap(
  organizationId: string,
  storeId?: string | null,
): Promise<PaymentMethodDrawerMap> {
  const { rows } = await query<{ code: string; opens_drawer: boolean }>(
    `SELECT code, opens_drawer FROM payment_methods WHERE organization_id = $1`,
    [organizationId],
  );
  const map: PaymentMethodDrawerMap = {};
  for (const r of rows) map[r.code] = r.opens_drawer;
  if (storeId) {
    Object.assign(map, await loadPaymentMethodDrawerOverrides(organizationId, storeId));
  }
  return map;
}
