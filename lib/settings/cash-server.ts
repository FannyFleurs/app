import 'server-only';
import type { PoolClient } from 'pg';
import { query as poolQuery } from '@/lib/db/client';
import { CASH_KEY, mergeCashDefaults, type CashSettings } from './cash';
import { scopedSettingKey } from './scoped';

/**
 * Mode « fonds commun » configuré pour cette boutique.
 *
 * true (défaut) : une seule session ouverte fait foi pour TOUTE la boutique,
 * quel que soit le poste qui l'a ouverte (les autres postes la rejoignent sans
 * créer la leur). Toute résolution de la session courante — lecture (affichage
 * caisse) ET écriture (création / validation d'une vente) — doit alors se faire
 * au niveau BOUTIQUE. Sinon un poste ayant rejoint le fonds d'un autre poste
 * voit la caisse « ouverte » mais échoue à vendre (NO_OPEN_CASH_SESSION).
 *
 * `client` (optionnel) : lit le réglage DANS la transaction d'une vente en
 * cours, pour un instantané cohérent avec la résolution de session qui suit.
 */
export async function isSharedFloat(
  organizationId: string,
  storeId: string | null,
  client?: PoolClient,
): Promise<boolean> {
  if (!storeId) return false;
  const storeKey = scopedSettingKey(CASH_KEY, storeId);
  const sql = `SELECT value FROM settings
      WHERE organization_id = $1 AND key = ANY($2::text[])
      ORDER BY (key = $3) DESC
      LIMIT 1`;
  const params = [organizationId, [storeKey, CASH_KEY], storeKey];
  const rows = client
    ? (await client.query<{ value: Partial<CashSettings> }>(sql, params)).rows
    : (await poolQuery<{ value: Partial<CashSettings> }>(sql, params)).rows;
  return mergeCashDefaults(rows[0]?.value ?? null).shared_float;
}
