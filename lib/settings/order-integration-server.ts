import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { query } from '@/lib/db/client';
import {
  ORDER_INTEGRATION_KEY,
  mergeOrderIntegrationDefaults,
  type OrderIntegrationSettings,
} from './order-integration';

/** SHA-256 hex d'une chaîne (jeton entrant). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Jeton opaque montré une seule fois (préfixe repérable + 32 octets base64url). */
export function generateOrderToken(): string {
  return `hpo_${randomBytes(32).toString('base64url')}`;
}

/** Secret de signature du callback (montré une seule fois). */
export function generateCallbackSecret(): string {
  return `hpk_${randomBytes(32).toString('base64url')}`;
}

/** Charge le réglage d'intégration commande d'une organisation. */
export async function loadOrderIntegration(
  organizationId: string,
): Promise<OrderIntegrationSettings> {
  const { rows } = await query<{ value: Partial<OrderIntegrationSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, ORDER_INTEGRATION_KEY],
  );
  return mergeOrderIntegrationDefaults(rows[0]?.value ?? null);
}

/** Écrit (upsert) le réglage d'intégration commande d'une organisation. */
export async function saveOrderIntegration(
  organizationId: string,
  value: OrderIntegrationSettings,
  updatedBy: string | null,
): Promise<void> {
  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, ORDER_INTEGRATION_KEY, JSON.stringify(value), updatedBy],
  );
}

/**
 * Résout l'organisation à partir du jeton entrant présenté par l'app commande.
 * Ne renvoie une organisation que si l'intégration est ACTIVE et le hash colle.
 * La comparaison de hash est à temps constant.
 */
export async function resolveOrgByOrderToken(
  token: string,
): Promise<{ organizationId: string; settings: OrderIntegrationSettings } | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const hash = sha256Hex(trimmed);
  const hashBuf = Buffer.from(hash, 'hex');

  // Peu d'organisations activent l'intégration : on lit les lignes concernées
  // et on compare le hash en mémoire (comparaison à temps constant).
  const { rows } = await query<{ organization_id: string; value: Partial<OrderIntegrationSettings> }>(
    `SELECT organization_id, value FROM settings WHERE key = $1`,
    [ORDER_INTEGRATION_KEY],
  );
  for (const row of rows) {
    const s = mergeOrderIntegrationDefaults(row.value);
    if (!s.enabled || !s.token_hash) continue;
    const candidate = Buffer.from(s.token_hash, 'hex');
    if (candidate.length === hashBuf.length && timingSafeEqual(candidate, hashBuf)) {
      return { organizationId: row.organization_id, settings: s };
    }
  }
  return null;
}
