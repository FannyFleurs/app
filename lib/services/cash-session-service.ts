import type { PoolClient } from 'pg';
import { withTransaction, query } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';

export class CashSessionService {
  /**
   * Identifiant de la session ouverte qui FAIT FOI pour ce poste, en tenant
   * compte du mode « fonds commun ».
   *
   * - Fonds commun (`shared` = true) : la session de la BOUTIQUE, ouverte par
   *   n'importe quel poste (la plus ancienne encore ouverte, comme
   *   getOpenForStore). Les postes qui l'ont rejointe n'ont pas de session
   *   propre : les résoudre par `register_id` renverrait « aucune » à tort.
   * - Fonds individuel : la session propre au poste (la plus récente).
   *
   * Point unique de résolution : l'affichage de la caisse, la création et la
   * validation d'une vente s'appuient tous dessus, pour ne JAMAIS diverger
   * (caisse « ouverte » d'un côté, NO_OPEN_CASH_SESSION de l'autre).
   *
   * `client` (optionnel) : reste dans la transaction d'une vente en cours.
   */
  static async resolveOpenSessionId(args: {
    storeId: string;
    registerId: string;
    shared: boolean;
    client?: PoolClient;
  }): Promise<string | null> {
    const sql = args.shared
      ? `SELECT id FROM cash_sessions
           WHERE store_id = $1 AND status = 'open'
           ORDER BY opened_at ASC LIMIT 1`
      : `SELECT id FROM cash_sessions
           WHERE register_id = $1 AND status = 'open'
           ORDER BY opened_at DESC LIMIT 1`;
    const param = args.shared ? args.storeId : args.registerId;
    const rows = args.client
      ? (await args.client.query<{ id: string }>(sql, [param])).rows
      : (await query<{ id: string }>(sql, [param])).rows;
    return rows[0]?.id ?? null;
  }

  /**
   * Session ouverte de la BOUTIQUE, quel que soit le poste qui l'a ouverte.
   *
   * Utilisée en mode « fonds commun » : la boutique n'a qu'un seul fonds, donc
   * une seule session ouverte. Tous les postes s'y rattachent — le premier
   * l'ouvre, les autres encaissent dessus, et la première fermeture vaut pour
   * toute la boutique.
   */
  static async getOpenForStore(storeId: string) {
    const { rows } = await query<{
      id: string;
      opened_at: string;
      opened_by: string;
      opening_float: string;
      register_id: string;
      register_name: string | null;
      opened_by_name: string | null;
    }>(
      `SELECT cs.id, cs.opened_at, cs.opened_by, cs.opening_float, cs.register_id,
              r.name AS register_name, u.full_name AS opened_by_name
         FROM cash_sessions cs
         LEFT JOIN registers r ON r.id = cs.register_id
         LEFT JOIN users u ON u.id = cs.opened_by
        WHERE cs.store_id = $1 AND cs.status = 'open'
        ORDER BY cs.opened_at ASC LIMIT 1`,
      [storeId],
    );
    return rows[0] ?? null;
  }

  static async getOpenForRegister(registerId: string) {
    const { rows } = await query<{
      id: string;
      opened_at: string;
      opened_by: string;
      opening_float: string;
    }>(
      `SELECT id, opened_at, opened_by, opening_float
         FROM cash_sessions
        WHERE register_id = $1 AND status = 'open'
        ORDER BY opened_at DESC LIMIT 1`,
      [registerId],
    );
    return rows[0] ?? null;
  }

  static async open(args: {
    organizationId: string;
    storeId: string;
    registerId: string;
    userId: string;
    openingFloat: number;
    /** Fonds commun : une seule session ouverte pour toute la boutique. */
    shared?: boolean;
  }) {
    return withTransaction(async (client) => {
      // En fonds commun, une session déjà ouverte sur la boutique — même
      // depuis un autre poste — est REJOINTE, pas refusée : le second poste
      // n'a rien à ouvrir, il encaisse sur le fonds déjà déclaré.
      if (args.shared) {
        const shared = await client.query<{ id: string }>(
          `SELECT id FROM cash_sessions
            WHERE store_id = $1 AND status = 'open'
            ORDER BY opened_at ASC LIMIT 1`,
          [args.storeId],
        );
        const joined = shared.rows[0];
        if (joined) return { id: joined.id, joined: true };
      }

      const existing = await client.query(
        `SELECT id FROM cash_sessions
          WHERE register_id = $1 AND status = 'open'`,
        [args.registerId],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new Error('CASH_SESSION_ALREADY_OPEN');
      }
      let ins: { rows: { id: string }[] };
      try {
        ins = await client.query<{ id: string }>(
          `INSERT INTO cash_sessions
             (organization_id, store_id, register_id, opened_by, opening_float)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id`,
          [args.organizationId, args.storeId, args.registerId, args.userId, args.openingFloat],
        );
      } catch (e) {
        // Course « double-tap » : l'index unique partiel (migration 0041)
        // rejette une 2ᵉ session ouverte pour ce poste → erreur propre.
        if ((e as { code?: string }).code === '23505') {
          throw new Error('CASH_SESSION_ALREADY_OPEN');
        }
        throw e;
      }

      const fiscal = new FiscalCore(client);
      await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: args.storeId,
        registerId: args.registerId,
        userId: args.userId,
        eventType: 'CASH_SESSION_OPENED',
        entityType: 'cash_session',
        entityId: ins.rows[0]!.id,
        payload: { opening_float: args.openingFloat },
      });

      return { id: ins.rows[0]!.id };
    });
  }

  static async close(args: {
    organizationId: string;
    sessionId: string;
    userId: string;
    countedCash: number;
  }) {
    return withTransaction(async (client) => {
      const sess = await client.query<{
        id: string;
        store_id: string;
        register_id: string;
        opening_float: string;
        status: string;
      }>(
        `SELECT id, store_id, register_id, opening_float, status
           FROM cash_sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [args.sessionId, args.organizationId],
      );
      if (sess.rowCount === 0) throw new Error('CASH_SESSION_NOT_FOUND');
      if (sess.rows[0]!.status !== 'open') throw new Error('CASH_SESSION_NOT_OPEN');

      const expectedRes = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(p.amount),0)::text AS total
           FROM payments p
           JOIN sales s ON s.id = p.sale_id
          WHERE s.cash_session_id = $1 AND p.method = 'cash'`,
        [args.sessionId],
      );
      const inOutRes = await client.query<{ ins: string; outs: string }>(
        `SELECT
            COALESCE(SUM(CASE WHEN movement_type='in'  THEN amount END),0)::text AS ins,
            COALESCE(SUM(CASE WHEN movement_type='out' THEN amount END),0)::text AS outs
           FROM cash_movements WHERE cash_session_id = $1`,
        [args.sessionId],
      );
      const opening = Number(sess.rows[0]!.opening_float);
      const salesCash = Number(expectedRes.rows[0]!.total);
      const ins = Number(inOutRes.rows[0]!.ins);
      const outs = Number(inOutRes.rows[0]!.outs);
      const expected = Number((opening + salesCash + ins - outs).toFixed(2));
      const variance = Number((args.countedCash - expected).toFixed(2));

      await client.query(
        `UPDATE cash_sessions SET
           status = 'closed',
           closed_by = $2,
           closed_at = now(),
           counted_cash = $3,
           expected_cash = $4,
           cash_variance = $5
         WHERE id = $1`,
        [args.sessionId, args.userId, args.countedCash, expected, variance],
      );

      const fiscal = new FiscalCore(client);
      await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: sess.rows[0]!.store_id,
        registerId: sess.rows[0]!.register_id,
        userId: args.userId,
        eventType: 'CASH_SESSION_CLOSED',
        entityType: 'cash_session',
        entityId: args.sessionId,
        payload: {
          opening_float: opening,
          sales_cash_total: salesCash,
          ins,
          outs,
          counted_cash: args.countedCash,
          expected_cash: expected,
          variance,
        },
      });

      return { expected, variance };
    });
  }
}
