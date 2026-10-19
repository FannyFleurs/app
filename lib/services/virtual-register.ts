import type { PoolClient, QueryResultRow } from 'pg';
import { query as rawQuery } from '@/lib/db/client';

const VIRTUAL_REGISTER_CODE = 'WEB';
const VIRTUAL_REGISTER_NAME = 'Commandes automatiques';

/**
 * Caisse virtuelle d'une boutique : un poste spécial (`is_virtual = TRUE`),
 * jamais lié à un appareil physique, dédié à l'encaissement automatique des
 * commandes WEB/OGF (voir lib/services/order-intake.ts). Sa session de
 * caisse reste EN PERMANENCE ouverte — c'est ce qui permet d'encaisser une
 * commande même quand aucun poste physique n'est ouvert — et n'est jamais
 * fermée par la clôture du soir (voir closing-service.ts).
 *
 * `resolveOpenSessionId`/`getOpenForStore`/`CashSessionService.open` excluent
 * explicitement cette caisse de la résolution "session ouverte de la
 * boutique" en fonds commun, pour qu'un poste réel n'y encaisse jamais une
 * vente comptant par erreur.
 *
 * Crée la caisse et sa session à la demande (idempotent), pour ne rien
 * nécessiter en amont — le réglage "Commandes automatiques" peut être activé
 * sans action préalable sur les registres.
 */
export async function ensureVirtualRegisterSession(
  organizationId: string,
  storeId: string,
  /** Titulaire fiscal `cash_sessions.opened_by` (NOT NULL) — même "utilisateur
   *  porteur" (propriétaire, ou le plus ancien) que le reste de l'intake. */
  userId: string,
  client?: PoolClient,
): Promise<{ registerId: string; sessionId: string }> {
  const run = client
    ? <T extends QueryResultRow>(sql: string, params: unknown[]) => client.query<T>(sql, params).then((r) => r.rows)
    : <T extends QueryResultRow>(sql: string, params: unknown[]) => rawQuery<T>(sql, params).then((r) => r.rows);

  let [reg] = await run<{ id: string }>(
    `SELECT id FROM registers WHERE store_id = $1 AND organization_id = $2 AND is_virtual = TRUE LIMIT 1`,
    [storeId, organizationId],
  );
  if (!reg) {
    try {
      [reg] = await run<{ id: string }>(
        `INSERT INTO registers (organization_id, store_id, code, name, is_active, is_virtual)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)
         RETURNING id`,
        [organizationId, storeId, VIRTUAL_REGISTER_CODE, VIRTUAL_REGISTER_NAME],
      );
    } catch (e) {
      // Course : créée entre-temps (contrainte UNIQUE (store_id, code)).
      if ((e as { code?: string }).code === '23505') {
        [reg] = await run<{ id: string }>(
          `SELECT id FROM registers WHERE store_id = $1 AND organization_id = $2 AND is_virtual = TRUE LIMIT 1`,
          [storeId, organizationId],
        );
      } else {
        throw e;
      }
    }
  }
  if (!reg) throw new Error('VIRTUAL_REGISTER_UNAVAILABLE');

  let [sess] = await run<{ id: string }>(
    `SELECT id FROM cash_sessions WHERE register_id = $1 AND status = 'open' LIMIT 1`,
    [reg.id],
  );
  if (!sess) {
    try {
      [sess] = await run<{ id: string }>(
        `INSERT INTO cash_sessions (organization_id, store_id, register_id, opened_by, opening_float)
         VALUES ($1, $2, $3, $4, 0)
         RETURNING id`,
        [organizationId, storeId, reg.id, userId],
      );
    } catch (e) {
      // Course : ouverte entre-temps (index unique partiel, migration 0041).
      if ((e as { code?: string }).code === '23505') {
        [sess] = await run<{ id: string }>(
          `SELECT id FROM cash_sessions WHERE register_id = $1 AND status = 'open' LIMIT 1`,
          [reg.id],
        );
      } else {
        throw e;
      }
    }
  }
  if (!sess) throw new Error('VIRTUAL_REGISTER_UNAVAILABLE');

  return { registerId: reg.id, sessionId: sess.id };
}
