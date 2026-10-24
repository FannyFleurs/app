import 'server-only';
import { query } from '@/lib/db/client';
import { scopedSettingKey } from './scoped';
import { POS_UI_KEY } from './pos-ui';

/**
 * Affichage de la bulle de stock sur la tuile produit — réglage PAR BOUTIQUE
 * (clé `pos_show_stock:<storeId>`), avec repli sur un réglage par défaut au
 * niveau organisation (`pos_show_stock`, sans boutique), lui-même avec repli
 * sur l'ancien emplacement unique `pos_ui.show_stock` (organisation entière,
 * avant ce réglage par boutique) — pour qu'une organisation déjà configurée
 * ne voie pas son choix réinitialisé au déploiement.
 *
 * Priorité : boutique > organisation (nouvelle clé) > organisation (ancienne
 * clé, repli de transition) > null (l'appelant applique POS_UI_DEFAULTS).
 */
export const SHOW_STOCK_KEY = 'pos_show_stock';

export async function loadShowStockOverride(
  organizationId: string,
  storeId?: string | null,
): Promise<boolean | null> {
  const storeKey = scopedSettingKey(SHOW_STOCK_KEY, storeId);
  const keys = storeId ? [storeKey, SHOW_STOCK_KEY, POS_UI_KEY] : [SHOW_STOCK_KEY, POS_UI_KEY];
  const { rows } = await query<{ key: string; value: { show_stock?: boolean } }>(
    `SELECT key, value FROM settings WHERE organization_id = $1 AND key = ANY($2::text[])`,
    [organizationId, keys],
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  if (storeId) {
    const own = byKey.get(storeKey)?.show_stock;
    if (own !== undefined) return own;
  }
  const orgNew = byKey.get(SHOW_STOCK_KEY)?.show_stock;
  if (orgNew !== undefined) return orgNew;
  return byKey.get(POS_UI_KEY)?.show_stock ?? null;
}

/** Tous les réglages `pos_show_stock:<storeId>` de l'organisation, par
 *  boutique — pour la caisse, dont la boutique n'est résolue que côté client
 *  (poste itinérant compris) : même motif que storeTileSizes dans
 *  app/(app)/caisse/page.tsx. */
export async function loadAllShowStockOverrides(organizationId: string): Promise<Record<string, boolean>> {
  const { rows } = await query<{ key: string; value: { show_stock?: boolean } }>(
    `SELECT key, value FROM settings WHERE organization_id = $1 AND key LIKE $2`,
    [organizationId, `${SHOW_STOCK_KEY}:%`],
  );
  const out: Record<string, boolean> = {};
  for (const r of rows) {
    const storeId = r.key.slice(`${SHOW_STOCK_KEY}:`.length);
    if (storeId && r.value?.show_stock !== undefined) out[storeId] = r.value.show_stock;
  }
  return out;
}

export async function saveShowStockOverride(
  organizationId: string,
  storeId: string | null,
  showStock: boolean,
  userId: string,
): Promise<void> {
  const key = scopedSettingKey(SHOW_STOCK_KEY, storeId);
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, key, JSON.stringify({ show_stock: showStock }), userId],
  );
}
