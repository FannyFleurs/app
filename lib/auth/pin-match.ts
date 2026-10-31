import { query } from '@/lib/db/client';
import { verifyPassword } from './password';
import type { PinSessionUser } from './pin-session';

/**
 * Comptes dont le PIN correspond à `pin`, parmi ceux éligibles sur CE poste
 * — même périmètre que /api/users/select (organisation + boutique du poste
 * le cas échéant). Extrait de la route pin-login-auto pour pouvoir être
 * testé directement (la route elle-même dépend de `cookies()`/`headers()`,
 * indisponibles hors contexte de requête Next.js).
 *
 * Normalement 0 ou 1 résultat ; plusieurs si deux comptes partagent le même
 * PIN sur ce poste (l'appelant doit alors refuser de deviner).
 */
export async function findUsersByPin(
  tenantId: string,
  storeId: string | null,
  pin: string,
): Promise<PinSessionUser[]> {
  const storeFilter = storeId
    ? `AND (
         u.role IN ('super_admin','owner','manager')
         OR EXISTS (SELECT 1 FROM user_store_access usa WHERE usa.user_id = u.id AND usa.store_id = $2)
         OR NOT EXISTS (SELECT 1 FROM user_store_access usa WHERE usa.user_id = u.id)
       )`
    : '';
  const params = storeId ? [tenantId, storeId] : [tenantId];

  const candidates = await query<PinSessionUser & {
    pin_code_hash: string; locked_until: string | null;
  }>(
    `SELECT u.id, u.organization_id, u.full_name, u.role, u.email,
            u.pin_code_hash, u.locked_until
       FROM users u
      WHERE u.organization_id = $1
        AND u.is_active = TRUE
        AND COALESCE(u.is_service, FALSE) = FALSE
        AND u.role <> 'comptable'
        AND COALESCE(u.pin_required, TRUE) = TRUE
        AND u.pin_code_hash IS NOT NULL
        ${storeFilter}`,
    params,
  );

  const now = Date.now();
  const eligible = candidates.rows.filter((u) => !(u.locked_until && new Date(u.locked_until).getTime() > now));

  const matches: PinSessionUser[] = [];
  for (const u of eligible) {
    if (await verifyPassword(pin, u.pin_code_hash)) {
      matches.push({ id: u.id, organization_id: u.organization_id, full_name: u.full_name, role: u.role, email: u.email });
    }
  }
  return matches;
}
