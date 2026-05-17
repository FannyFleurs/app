import { withTransaction, query } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';

export class CashSessionService {
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
  }) {
    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM cash_sessions
          WHERE register_id = $1 AND status = 'open'`,
        [args.registerId],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new Error('CASH_SESSION_ALREADY_OPEN');
      }
      const ins = await client.query<{ id: string }>(
        `INSERT INTO cash_sessions
           (organization_id, store_id, register_id, opened_by, opening_float)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [args.organizationId, args.storeId, args.registerId, args.userId, args.openingFloat],
      );

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
