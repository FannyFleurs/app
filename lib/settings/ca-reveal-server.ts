import 'server-only';
import { query } from '@/lib/db/client';
import { scopedSettingKey } from './scoped';

/**
 * Affichage du CA du jour sur la TopBar de la caisse (icône « œil » à gauche
 * du bouton assistance) — réglage PAR BOUTIQUE (clé `pos_ca_reveal:<storeId>`),
 * avec repli sur un réglage par défaut au niveau organisation
 * (`pos_ca_reveal`, sans boutique). Désactivé par défaut (null) : le CA est
 * une donnée sensible, elle ne s'affiche que si une boutique l'active.
 *
 * Priorité : boutique > organisation > null (l'appelant applique `false`).
 */
export const CA_REVEAL_KEY = 'pos_ca_reveal';

export async function loadCaRevealOverride(
  organizationId: string,
  storeId?: string | null,
): Promise<boolean | null> {
  const storeKey = scopedSettingKey(CA_REVEAL_KEY, storeId);
  const keys = storeId ? [storeKey, CA_REVEAL_KEY] : [CA_REVEAL_KEY];
  const { rows } = await query<{ key: string; value: { enabled?: boolean } }>(
    `SELECT key, value FROM settings WHERE organization_id = $1 AND key = ANY($2::text[])`,
    [organizationId, keys],
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  if (storeId) {
    const own = byKey.get(storeKey)?.enabled;
    if (own !== undefined) return own;
  }
  return byKey.get(CA_REVEAL_KEY)?.enabled ?? null;
}

export async function saveCaRevealOverride(
  organizationId: string,
  storeId: string | null,
  enabled: boolean,
  userId: string,
): Promise<void> {
  const key = scopedSettingKey(CA_REVEAL_KEY, storeId);
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, key, JSON.stringify({ enabled }), userId],
  );
}
