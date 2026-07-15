import 'server-only';
import { query } from '@/lib/db/client';
import { scopedSettingKey } from './scoped';

/**
 * Charge la valeur brute d'un réglage pour une boutique, avec repli.
 *
 * Priorité : configuration propre à la boutique (`<baseKey>:<storeId>`), sinon
 * repli sur la configuration au niveau organisation (`baseKey`), sinon null.
 * L'appelant applique ensuite ses propres valeurs par défaut (merge*Defaults).
 */
export async function loadScopedSettingValue<T>(
  organizationId: string,
  baseKey: string,
  storeId?: string | null,
): Promise<Partial<T> | null> {
  const storeKey = scopedSettingKey(baseKey, storeId);
  const { rows } = await query<{ value: Partial<T> }>(
    `SELECT value FROM settings
      WHERE organization_id = $1 AND key = ANY($2::text[])
      ORDER BY (key = $3) DESC
      LIMIT 1`,
    [organizationId, [storeKey, baseKey], storeKey],
  );
  return rows[0]?.value ?? null;
}
