import 'server-only';
import { query } from '@/lib/db/client';
import {
  ONLINE_GIFT_CARDS_KEY,
  mergeOnlineGiftCardsDefaults,
  generatePublicKey,
  type OnlineGiftCardsSettings,
} from './online-gift-cards';

/** Charge le réglage « cartes cadeaux en ligne » d'une organisation. */
export async function loadOnlineGiftCards(
  organizationId: string,
): Promise<OnlineGiftCardsSettings> {
  const { rows } = await query<{ value: Partial<OnlineGiftCardsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, ONLINE_GIFT_CARDS_KEY],
  );
  if (rows.length > 0) return mergeOnlineGiftCardsDefaults(rows[0]!.value);

  // Première consultation : la clé publique est générée automatiquement,
  // dès la création du réglage — pas seulement à l'activation — pour qu'il
  // y en ait toujours une à afficher (l'organisation n'a rien à faire).
  const initial: OnlineGiftCardsSettings = {
    ...mergeOnlineGiftCardsDefaults(null),
    public_key: generatePublicKey(),
    created_at: new Date().toISOString(),
  };
  await saveOnlineGiftCards(organizationId, initial, null);
  return initial;
}

/** Écrit (upsert) le réglage « cartes cadeaux en ligne » d'une organisation. */
export async function saveOnlineGiftCards(
  organizationId: string,
  value: OnlineGiftCardsSettings,
  updatedBy: string | null,
): Promise<void> {
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, ONLINE_GIFT_CARDS_KEY, JSON.stringify(value), updatedBy],
  );
}

/** Régénère la clé publique (garde le reste du réglage inchangé). */
export async function regenerateOnlineGiftCardsKey(
  organizationId: string,
  updatedBy: string | null,
): Promise<OnlineGiftCardsSettings> {
  const current = await loadOnlineGiftCards(organizationId);
  const next: OnlineGiftCardsSettings = { ...current, public_key: generatePublicKey() };
  await saveOnlineGiftCards(organizationId, next, updatedBy);
  return next;
}

/**
 * Retrouve l'organisation à partir de la clé publique d'intégration
 * (hp_gc_...) — utilisé par l'API PUBLIQUE (aucune session). Recherche
 * indexée (migration 0079, index d'expression sur `value->>'public_key'`) :
 * PAS de scan de tous les settings, contrairement au lookup par jeton de
 * order_integration (tolérable là car peu d'organisations l'activent — ici
 * l'API sera appelée par des sites publics, potentiellement bien plus souvent).
 */
export async function resolveOrgByPublicKey(
  publicKey: string,
): Promise<{ organizationId: string; settings: OnlineGiftCardsSettings } | null> {
  const trimmed = publicKey.trim();
  if (!trimmed) return null;
  const { rows } = await query<{ organization_id: string; value: Partial<OnlineGiftCardsSettings> }>(
    `SELECT organization_id, value FROM settings
      WHERE key = $1 AND value->>'public_key' = $2`,
    [ONLINE_GIFT_CARDS_KEY, trimmed],
  );
  if (rows.length === 0) return null;
  return {
    organizationId: rows[0]!.organization_id,
    settings: mergeOnlineGiftCardsDefaults(rows[0]!.value),
  };
}
