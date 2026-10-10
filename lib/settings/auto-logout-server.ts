import 'server-only';
import { query } from '@/lib/db/client';
import { scopedSettingKey } from './scoped';
import { POS_UI_KEY, type AutoLogoutMode } from './pos-ui';

/**
 * Déconnexion automatique (verrouillage) de la caisse — réglage PAR BOUTIQUE
 * (clé `pos_auto_logout:<storeId>`), même principe que la taille des tuiles
 * (tile-size-server.ts) : repli sur un réglage par défaut au niveau
 * organisation (`pos_auto_logout`, sans boutique), lui-même avec repli sur
 * l'ancien emplacement unique `pos_ui.auto_logout_mode` / `.auto_logout_minutes`
 * (avant ce réglage par boutique, une seule valeur existait pour toute
 * l'organisation) — pour que les organisations déjà configurées ne voient pas
 * leur réglage réinitialisé au déploiement, sans script de migration.
 *
 * Priorité : boutique > organisation (nouvelle clé) > organisation (ancienne
 * clé, repli de transition) > null (l'appelant applique alors POS_UI_DEFAULTS).
 *
 * Le MÉCANISME de déconnexion lui-même (écran de connexion / code PIN) n'est
 * pas modifié : seul le réglage qui déclenche ce mécanisme devient
 * paramétrable par boutique (voir components/AppShell.tsx, qui applique la
 * valeur sans savoir d'où elle vient).
 */
export const AUTO_LOGOUT_KEY = 'pos_auto_logout';

export interface AutoLogoutOverride {
  auto_logout_mode: AutoLogoutMode;
  auto_logout_minutes: number;
}

function fromRow(v?: Partial<AutoLogoutOverride>): AutoLogoutOverride | null {
  if (!v || v.auto_logout_mode == null) return null;
  return {
    auto_logout_mode: v.auto_logout_mode,
    auto_logout_minutes: v.auto_logout_minutes ?? 10,
  };
}

export async function loadAutoLogoutOverride(
  organizationId: string,
  storeId?: string | null,
): Promise<AutoLogoutOverride | null> {
  const storeKey = scopedSettingKey(AUTO_LOGOUT_KEY, storeId);
  const keys = storeId ? [storeKey, AUTO_LOGOUT_KEY, POS_UI_KEY] : [AUTO_LOGOUT_KEY, POS_UI_KEY];
  const { rows } = await query<{ key: string; value: Partial<AutoLogoutOverride> }>(
    `SELECT key, value FROM settings WHERE organization_id = $1 AND key = ANY($2::text[])`,
    [organizationId, keys],
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  if (storeId) {
    const own = fromRow(byKey.get(storeKey));
    if (own) return own;
  }
  return fromRow(byKey.get(AUTO_LOGOUT_KEY)) ?? fromRow(byKey.get(POS_UI_KEY));
}

/** Tous les réglages `pos_auto_logout:<storeId>` de l'organisation, par
 *  boutique — même motif que loadAllTileSizeOverrides (la boutique du poste
 *  n'est résolue que côté client, poste itinérant compris). */
export async function loadAllAutoLogoutOverrides(organizationId: string): Promise<Record<string, AutoLogoutOverride>> {
  const { rows } = await query<{ key: string; value: Partial<AutoLogoutOverride> }>(
    `SELECT key, value FROM settings WHERE organization_id = $1 AND key LIKE $2`,
    [organizationId, `${AUTO_LOGOUT_KEY}:%`],
  );
  const out: Record<string, AutoLogoutOverride> = {};
  for (const r of rows) {
    const storeId = r.key.slice(`${AUTO_LOGOUT_KEY}:`.length);
    const value = fromRow(r.value);
    if (storeId && value) out[storeId] = value;
  }
  return out;
}

export async function saveAutoLogoutOverride(
  organizationId: string,
  storeId: string | null,
  value: AutoLogoutOverride,
  userId: string,
): Promise<void> {
  const key = scopedSettingKey(AUTO_LOGOUT_KEY, storeId);
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, key, JSON.stringify(value), userId],
  );
}
