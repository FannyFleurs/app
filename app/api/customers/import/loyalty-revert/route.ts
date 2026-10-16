import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { round2 } from '@/lib/services/money';

const schema = z.object({
  started_at: z.string(),
  ended_at: z.string(),
});

/**
 * Annule un lot d'import de points de fidélité (voir loyalty-batches/route.ts
 * pour la liste des lots). Insère un mouvement compensatoire par ligne
 * (loyalty_movements est append-only, voir fn_block_update_delete) et retire
 * exactement le montant crédité du solde — jamais un simple retour à zéro,
 * pour ne pas effacer une activité fidélité légitime antérieure ou
 * postérieure à l'import sur le même compte.
 *
 * Idempotent : un mouvement déjà annulé (source_id déjà référencé par un
 * mouvement 'import_revert') est ignoré, donc rejouer le même lot ne double
 * pas l'annulation.
 */
export async function POST(req: Request) {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { started_at, ended_at } = parsed.data;

  const result = await withTransaction(async (client) => {
    const movements = await client.query<{ id: string; account_id: string; points_delta: string }>(
      `SELECT lm.id, lm.account_id, lm.points_delta::text
         FROM loyalty_movements lm
        WHERE lm.organization_id = $1 AND lm.source_type = 'import'
          AND lm.created_at BETWEEN $2 AND $3
          AND NOT EXISTS (
            SELECT 1 FROM loyalty_movements r
             WHERE r.source_type = 'import_revert' AND r.source_id = lm.id
          )
        ORDER BY lm.created_at ASC
        FOR UPDATE OF lm`,
      [g.user.organizationId, started_at, ended_at],
    );

    let totalReverted = 0;
    for (const m of movements.rows) {
      const acc = await client.query<{ points_balance: string }>(
        `SELECT points_balance::text FROM loyalty_accounts WHERE id = $1 FOR UPDATE`,
        [m.account_id],
      );
      const delta = Number(m.points_delta);
      const next = round2(Number(acc.rows[0]?.points_balance ?? 0) - delta);
      await client.query(
        `UPDATE loyalty_accounts SET points_balance = $2, updated_at = now() WHERE id = $1`,
        [m.account_id, next],
      );
      await client.query(
        `INSERT INTO loyalty_movements
           (organization_id, account_id, movement_type, points_delta, balance_after, reason, source_type, source_id, user_id)
         VALUES ($1,$2,'cancel',$3,$4,'Annulation import fidélité (mauvaise colonne)','import_revert',$5,$6)`,
        [g.user.organizationId, m.account_id, round2(-delta), next, m.id, g.user.id],
      );
      totalReverted += delta;
    }
    return { reverted_count: movements.rows.length, total_points_reverted: round2(totalReverted) };
  });

  if (result.reverted_count === 0) return jsonError('NOTHING_TO_REVERT', 404);

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'customers.loyalty_import_revert',
    entityType: 'loyalty_movements',
    entityId: null,
    payload: { started_at, ended_at, ...result },
  });

  return NextResponse.json(result);
}
