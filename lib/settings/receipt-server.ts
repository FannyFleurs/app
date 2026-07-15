import 'server-only';
import { query } from '@/lib/db/client';
import { RECEIPT_KEY, receiptKey, mergeReceiptDefaults, type ReceiptSettings } from './receipt';

/**
 * Charge le paramétrage ticket effectif pour une boutique.
 *
 * Priorité : configuration propre à la boutique (`receipt:<storeId>`), sinon
 * repli sur la configuration historique au niveau organisation (`receipt`),
 * sinon valeurs par défaut. Ce repli garantit qu'une boutique jamais
 * configurée hérite du modèle existant, et qu'aucune donnée n'est perdue lors
 * du passage d'un ticket « par organisation » à un ticket « par boutique ».
 */
export async function loadReceiptSettings(
  organizationId: string,
  storeId?: string | null,
): Promise<ReceiptSettings> {
  const storeKey = receiptKey(storeId);
  const { rows } = await query<{ value: Partial<ReceiptSettings>; key: string }>(
    `SELECT value, key FROM settings
      WHERE organization_id = $1 AND key = ANY($2::text[])
      ORDER BY (key = $3) DESC
      LIMIT 1`,
    [organizationId, [storeKey, RECEIPT_KEY], storeKey],
  );
  return mergeReceiptDefaults(rows[0]?.value ?? null);
}
