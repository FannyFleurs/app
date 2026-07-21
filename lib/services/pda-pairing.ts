import 'server-only';
import { randomBytes } from 'crypto';
import { query, withTransaction } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';

/**
 * Appairage des PDA (app étiquettes dédiée).
 * Chaque boutique dispose d'un code d'appairage + d'un utilisateur de service
 * (rôle manager, masqué des écrans de connexion) qui porte la session du PDA.
 */

// Code lisible, sans caractères ambigus (0/O, 1/I…). Ex : "4F7K-92G8".
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(): string {
  const b = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i]! % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Trouve/crée l'utilisateur de service (PDA) rattaché à une boutique. */
async function ensureServiceUser(
  organizationId: string, storeId: string, storeName: string,
): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM users
      WHERE organization_id = $1 AND is_service = TRUE
        AND email = $2 LIMIT 1`,
    [organizationId, serviceEmail(storeId)],
  );
  if (existing.rowCount > 0) return existing.rows[0]!.id;

  return withTransaction(async (client) => {
    const secret = await hashPassword(randomBytes(24).toString('hex'));
    const ins = await client.query<{ id: string }>(
      `INSERT INTO users
         (organization_id, email, password_hash, full_name, role, is_active, is_service, pin_code_hash)
       VALUES ($1, $2, $3, $4, 'manager', TRUE, TRUE, $3)
       RETURNING id`,
      [organizationId, serviceEmail(storeId), secret, `PDA ${storeName}`.slice(0, 120)],
    );
    const userId = ins.rows[0]!.id;
    // Rattachement à la boutique (accès limité à cette boutique).
    await client.query(
      `INSERT INTO user_store_access (user_id, store_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, storeId],
    );
    return userId;
  });
}

function serviceEmail(storeId: string): string {
  return `pda-${storeId}@pda.local`;
}

/** Génère (ou régénère) le code d'appairage d'une boutique. */
export async function generatePairingCode(
  organizationId: string, storeId: string, storeName: string, createdBy: string,
): Promise<string> {
  const serviceUserId = await ensureServiceUser(organizationId, storeId, storeName);
  const code = makeCode();
  await query(
    `INSERT INTO label_pairings (organization_id, store_id, code, service_user_id, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (store_id)
     DO UPDATE SET code = EXCLUDED.code, service_user_id = EXCLUDED.service_user_id,
                   created_by = EXCLUDED.created_by, updated_at = now()`,
    [organizationId, storeId, code, serviceUserId, createdBy],
  );
  return code;
}

/** Code d'appairage courant d'une boutique (ou null). */
export async function getPairingCode(
  organizationId: string, storeId: string,
): Promise<string | null> {
  const r = await query<{ code: string }>(
    `SELECT code FROM label_pairings WHERE organization_id = $1 AND store_id = $2`,
    [organizationId, storeId],
  );
  return r.rows[0]?.code ?? null;
}

export interface ResolvedPairing {
  organization_id: string;
  store_id: string;
  store_name: string;
  service_user_id: string;
  role: string;
}

/** Résout un code d'appairage (contexte PDA : pas de session). */
export async function resolvePairing(code: string): Promise<ResolvedPairing | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const r = await query<ResolvedPairing>(
    `SELECT lp.organization_id, lp.store_id, s.name AS store_name,
            lp.service_user_id, u.role
       FROM label_pairings lp
       JOIN stores s ON s.id = lp.store_id
       JOIN users u ON u.id = lp.service_user_id
      WHERE upper(lp.code) = $1
      LIMIT 1`,
    [clean],
  );
  return r.rows[0] ?? null;
}
