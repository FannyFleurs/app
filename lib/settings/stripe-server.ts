import 'server-only';
import { query } from '@/lib/db/client';
import { scopedSettingKey } from './scoped';
import { STRIPE_KEY, mergeStripeDefaults, type StripeSettings } from './stripe';
import { encryptSecret, decryptSecret, SecretCryptoError } from '@/lib/security/secret-crypto';

/**
 * Configuration Stripe PAR BOUTIQUE, avec repli organisation (voir
 * lib/settings/scoped.ts : clé `stripe:<storeId>` sinon `stripe`) — même
 * mécanisme déjà utilisé par cash/facturation/imprimante/écran de livraison.
 * Réutilisé au lieu de dupliqué, conformément à l'audit préalable.
 *
 * Les secrets (`secret_key`, `webhook_secret`) sont chiffrés au repos (voir
 * lib/security/secret-crypto.ts) : chiffrés à l'écriture, déchiffrés à la
 * lecture. Un échec de déchiffrement (clé maître absente/incorrecte, donnée
 * corrompue) ne fait JAMAIS planter l'appelant : voir `loadStripeSettings`.
 */

export interface LoadedStripeSettings {
  settings: StripeSettings;
  /** La config affichée est-elle propre à CETTE boutique, ou héritée de l'organisation ? */
  ownStore: boolean;
  /** Un secret existe en base mais n'a pas pu être déchiffré (clé maître absente/incorrecte). */
  decryptionFailed: boolean;
}

/**
 * Charge la config Stripe effective d'une boutique (repli organisation si la
 * boutique n'a pas encore la sienne). Déchiffre les secrets à la lecture —
 * en cas d'échec de déchiffrement, ne lève JAMAIS : renvoie des secrets vides
 * (donc `enabled`/utilisable comme "non configuré", jamais un secret erroné
 * utilisé pour un appel Stripe) et journalise le détail côté serveur
 * uniquement, avec `decryptionFailed: true` pour que l'appelant puisse
 * distinguer "pas configuré" de "configuré mais illisible" s'il le souhaite.
 */
export async function loadStripeSettings(
  organizationId: string,
  storeId?: string | null,
): Promise<LoadedStripeSettings> {
  const storeKey = scopedSettingKey(STRIPE_KEY, storeId);
  const { rows } = await query<{ value: Partial<StripeSettings>; key: string }>(
    `SELECT value, key FROM settings
      WHERE organization_id = $1 AND key = ANY($2::text[])
      ORDER BY (key = $3) DESC
      LIMIT 1`,
    [organizationId, [storeKey, STRIPE_KEY], storeKey],
  );
  const raw = mergeStripeDefaults(rows[0]?.value ?? null);

  let decryptionFailed = false;
  function safeDecrypt(v: string): string {
    if (!v) return '';
    try {
      return decryptSecret(v);
    } catch (err) {
      decryptionFailed = true;
      // eslint-disable-next-line no-console
      console.error('[stripe-settings] échec de déchiffrement', organizationId, storeId ?? '(org)', err);
      return '';
    }
  }

  return {
    settings: {
      ...raw,
      secret_key: safeDecrypt(raw.secret_key),
      webhook_secret: safeDecrypt(raw.webhook_secret),
    },
    ownStore: !!storeId && rows[0]?.key === storeKey,
    decryptionFailed,
  };
}

/**
 * Écrit (upsert) la config Stripe d'une boutique (ou de l'organisation si
 * `storeId` est `null`). Chiffre les secrets avant stockage — voir
 * lib/security/secret-crypto.ts (transparent si `SECRETS_ENCRYPTION_KEY`
 * n'est pas encore configurée : écrit alors en clair, comme avant).
 */
export async function saveStripeSettings(
  organizationId: string,
  storeId: string | null,
  value: StripeSettings,
  updatedBy: string | null,
): Promise<void> {
  const toStore: StripeSettings = {
    ...value,
    secret_key: value.secret_key ? encryptSecret(value.secret_key) : '',
    webhook_secret: value.webhook_secret ? encryptSecret(value.webhook_secret) : '',
  };
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, scopedSettingKey(STRIPE_KEY, storeId), JSON.stringify(toStore), updatedBy],
  );
}

export { SecretCryptoError };
