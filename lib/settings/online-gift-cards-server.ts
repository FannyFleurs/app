import 'server-only';
import { query } from '@/lib/db/client';
import { scopedSettingKey } from './scoped';
import {
  ONLINE_GIFT_CARDS_KEY,
  mergeOnlineGiftCardsDefaults,
  generatePublicKey,
  looksLikePublicKey,
  type OnlineGiftCardsSettings,
} from './online-gift-cards';

/**
 * Intégration « Cartes cadeaux en ligne » — rattachée à une BOUTIQUE
 * (`online_gift_cards:<storeId>`, mécanisme générique de
 * lib/settings/scoped.ts, réutilisé plutôt que dupliqué) plutôt qu'à
 * l'organisation entière : une organisation multi-boutiques peut vendre des
 * cartes cadeaux pour PLUSIEURS sites, chacun avec sa propre clé publique,
 * ses propres origines autorisées, et (voir lib/settings/stripe-server.ts)
 * son propre compte Stripe.
 *
 * Une configuration SANS boutique (`online_gift_cards`, clé historique) peut
 * encore exister — configurations créées avant cette évolution, pas encore
 * migrées vers une boutique précise. Elle reste résolue par clé publique
 * (compatibilité), mais son `storeId` résolu est alors `null` : aucune
 * fonctionnalité qui a BESOIN d'une boutique (Stripe du store, file
 * d'attente caisse) ne doit jamais en deviner une arbitrairement — voir les
 * appelants (checkout, webhook).
 */

/** Charge le réglage « cartes cadeaux en ligne » d'une boutique (ou de
 *  l'organisation si `storeId` est omis/null — historique). */
export async function loadOnlineGiftCards(
  organizationId: string,
  storeId?: string | null,
): Promise<OnlineGiftCardsSettings> {
  const key = scopedSettingKey(ONLINE_GIFT_CARDS_KEY, storeId);
  const { rows } = await query<{ value: Partial<OnlineGiftCardsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, key],
  );
  if (rows.length > 0) return mergeOnlineGiftCardsDefaults(rows[0]!.value);

  // Première consultation POUR CETTE BOUTIQUE : la clé publique est générée
  // automatiquement, dès la création du réglage — pas seulement à
  // l'activation — pour qu'il y en ait toujours une à afficher (l'admin n'a
  // rien à faire). Chaque boutique reçoit sa PROPRE clé, jamais partagée.
  const initial: OnlineGiftCardsSettings = {
    ...mergeOnlineGiftCardsDefaults(null),
    public_key: generatePublicKey(),
    created_at: new Date().toISOString(),
  };
  await saveOnlineGiftCards(organizationId, storeId ?? null, initial, null);
  return initial;
}

/** Écrit (upsert) le réglage « cartes cadeaux en ligne » d'une boutique (ou
 *  de l'organisation si `storeId` est `null` — historique/repli). */
export async function saveOnlineGiftCards(
  organizationId: string,
  storeId: string | null,
  value: OnlineGiftCardsSettings,
  updatedBy: string | null,
): Promise<void> {
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, scopedSettingKey(ONLINE_GIFT_CARDS_KEY, storeId), JSON.stringify(value), updatedBy],
  );
}

/** Régénère la clé publique d'une boutique (garde le reste du réglage inchangé). */
export async function regenerateOnlineGiftCardsKey(
  organizationId: string,
  storeId: string | null,
  updatedBy: string | null,
): Promise<OnlineGiftCardsSettings> {
  const current = await loadOnlineGiftCards(organizationId, storeId);
  const next: OnlineGiftCardsSettings = { ...current, public_key: generatePublicKey() };
  await saveOnlineGiftCards(organizationId, storeId, next, updatedBy);
  return next;
}

export interface ResolvedOnlineGiftCards {
  organizationId: string;
  /** `null` uniquement pour une configuration historique non encore
   *  rattachée à une boutique précise — voir le commentaire de module. */
  storeId: string | null;
  settings: OnlineGiftCardsSettings;
}

/** Découpe une clé `settings` (`online_gift_cards` ou `online_gift_cards:<storeId>`)
 *  pour en extraire le `storeId` éventuel. */
function storeIdFromKey(key: string): string | null {
  const prefix = `${ONLINE_GIFT_CARDS_KEY}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

/**
 * Retrouve l'organisation ET la boutique à partir de la clé publique
 * d'intégration (hp_gc_...) — utilisé par l'API PUBLIQUE (aucune session).
 *
 * Recherche indexée sur les DEUX formes de clé possibles (historique
 * `online_gift_cards` exact — migration 0079 — et par boutique
 * `online_gift_cards:<storeId>` — migration 0092) : jamais un scan de tous
 * les settings, y compris maintenant qu'une organisation peut avoir
 * plusieurs configurations (une par boutique).
 */
export async function resolveOrgByPublicKey(
  publicKey: string,
): Promise<ResolvedOnlineGiftCards | null> {
  const trimmed = publicKey.trim();
  if (!trimmed) return null;
  const { rows } = await query<{ organization_id: string; key: string; value: Partial<OnlineGiftCardsSettings> }>(
    `SELECT organization_id, key, value FROM settings
      WHERE (key = $1 OR key LIKE $2)
        AND value->>'public_key' = $3`,
    [ONLINE_GIFT_CARDS_KEY, `${ONLINE_GIFT_CARDS_KEY}:%`, trimmed],
  );
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    organizationId: row.organization_id,
    storeId: storeIdFromKey(row.key),
    settings: mergeOnlineGiftCardsDefaults(row.value),
  };
}

/**
 * Résolution complète, partagée par toutes les routes PUBLIQUES de ce
 * module (config lecture seule, et paiement) : clé bien formée, connue, ET
 * intégration active. Renvoie `null` pour CHAQUE cas d'échec, sans
 * distinction — c'est aux appelants de traduire ça en la même réponse
 * neutre (404 GIFT_CARDS_NOT_AVAILABLE), pour ne jamais permettre de
 * distinguer publiquement une clé inconnue d'une intégration désactivée.
 */
export async function resolveActiveOnlineGiftCards(
  publicKey: string,
): Promise<ResolvedOnlineGiftCards | null> {
  if (!looksLikePublicKey(publicKey)) return null;
  const resolved = await resolveOrgByPublicKey(publicKey);
  if (!resolved || !resolved.settings.enabled) return null;
  return resolved;
}
