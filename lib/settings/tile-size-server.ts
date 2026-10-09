import 'server-only';
import { query } from '@/lib/db/client';
import { scopedSettingKey } from './scoped';
import { POS_UI_KEY, type PosTileSize } from './pos-ui';

/**
 * Taille des tuiles produit en caisse — réglage PAR BOUTIQUE (clé
 * `pos_tile_size:<storeId>`), avec repli sur un réglage par défaut au niveau
 * organisation (`pos_tile_size`, sans boutique), lui-même avec repli sur
 * l'ancien emplacement unique `pos_ui.tile_size` (avant ce réglage par
 * boutique, une seule valeur existait pour toute l'organisation) — pour que
 * les organisations déjà configurées ne voient pas leur taille réinitialisée
 * au déploiement, sans script de migration.
 *
 * Priorité : boutique > organisation (nouvelle clé) > organisation (ancienne
 * clé, repli de transition) > null (l'appelant applique alors POS_UI_DEFAULTS).
 */
export const TILE_SIZE_KEY = 'pos_tile_size';

export async function loadTileSizeOverride(
  organizationId: string,
  storeId?: string | null,
): Promise<PosTileSize | null> {
  const storeKey = scopedSettingKey(TILE_SIZE_KEY, storeId);
  const keys = storeId ? [storeKey, TILE_SIZE_KEY, POS_UI_KEY] : [TILE_SIZE_KEY, POS_UI_KEY];
  const { rows } = await query<{ key: string; value: { tile_size?: PosTileSize } }>(
    `SELECT key, value FROM settings WHERE organization_id = $1 AND key = ANY($2::text[])`,
    [organizationId, keys],
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  if (storeId) {
    const own = byKey.get(storeKey)?.tile_size;
    if (own) return own;
  }
  return byKey.get(TILE_SIZE_KEY)?.tile_size ?? byKey.get(POS_UI_KEY)?.tile_size ?? null;
}

/** Tous les réglages `pos_tile_size:<storeId>` de l'organisation, par boutique
 *  — pour la caisse, dont la boutique n'est résolue que côté client (poste
 *  itinérant compris) : voir storeTaxDefaults dans app/(app)/caisse/page.tsx
 *  pour le même motif. */
export async function loadAllTileSizeOverrides(organizationId: string): Promise<Record<string, PosTileSize>> {
  const { rows } = await query<{ key: string; value: { tile_size?: PosTileSize } }>(
    `SELECT key, value FROM settings WHERE organization_id = $1 AND key LIKE $2`,
    [organizationId, `${TILE_SIZE_KEY}:%`],
  );
  const out: Record<string, PosTileSize> = {};
  for (const r of rows) {
    const storeId = r.key.slice(`${TILE_SIZE_KEY}:`.length);
    if (storeId && r.value?.tile_size) out[storeId] = r.value.tile_size;
  }
  return out;
}

export async function saveTileSizeOverride(
  organizationId: string,
  storeId: string | null,
  tileSize: PosTileSize,
  userId: string,
): Promise<void> {
  const key = scopedSettingKey(TILE_SIZE_KEY, storeId);
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, key, JSON.stringify({ tile_size: tileSize }), userId],
  );
}
