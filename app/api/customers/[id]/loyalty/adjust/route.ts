import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction, query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  mergeWithDefaults, POS_UI_KEY, loyaltyGroupKey, type PosUiSettings,
} from '@/lib/settings/pos-ui';
import { loyaltyGroupReady } from '@/lib/services/loyalty-schema';
import { round2 } from '@/lib/services/money';

/**
 * Régularisation manuelle du solde fidélité d'un client (+ ou –), en euros.
 *
 * Utilisé depuis la fiche client pour corriger un solde (ex. reprise d'un
 * ancien logiciel). Le solde est exprimé en euros (avec centimes) : 1 « point »
 * applicatif = 1 €. Un mouvement `adjust` append-only est journalisé.
 */
const schema = z.object({
  // Montant signé en euros : positif = crédit, négatif = débit.
  amount_euros: z.number().finite().refine((n) => Math.abs(n) > 0, 'Montant requis'),
  reason: z.string().max(200).optional(),
  store_id: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;

  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const delta = round2(parsed.data.amount_euros);
  const reason = parsed.data.reason?.trim() || 'Régularisation manuelle';

  // Vérifie que le client appartient à l'organisation.
  const cust = await query<{ id: string }>(
    `SELECT id FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (cust.rowCount === 0) return jsonError('NOT_FOUND', 404);

  // Groupe fidélité ciblé : celui de la boutique si fournie, sinon commun ('*').
  const st = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(st.rows[0]?.value ?? null);
  const groupKey = loyaltyGroupKey(ui.loyalty, parsed.data.store_id ?? null);

  try {
    const result = await withTransaction(async (client) => {
      const grouped = await loyaltyGroupReady(client);
      const accSel = grouped
        ? await client.query<{ id: string; points_balance: string }>(
            `SELECT id, points_balance::text FROM loyalty_accounts
              WHERE customer_id = $1 AND group_key = $2 FOR UPDATE`,
            [params.id, groupKey],
          )
        : await client.query<{ id: string; points_balance: string }>(
            `SELECT id, points_balance::text FROM loyalty_accounts
              WHERE customer_id = $1 FOR UPDATE`,
            [params.id],
          );

      let accId: string;
      let current = 0;
      if (accSel.rowCount === 0) {
        const ins = grouped
          ? await client.query<{ id: string }>(
              `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance, group_key)
               VALUES ($1,$2,0,$3) RETURNING id`,
              [g.user.organizationId, params.id, groupKey],
            )
          : await client.query<{ id: string }>(
              `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance)
               VALUES ($1,$2,0) RETURNING id`,
              [g.user.organizationId, params.id],
            );
        accId = ins.rows[0]!.id;
      } else {
        accId = accSel.rows[0]!.id;
        current = Number(accSel.rows[0]!.points_balance);
      }

      const next = round2(current + delta);
      if (next < 0) throw new Error('SOLDE_NEGATIF');

      await client.query(
        `INSERT INTO loyalty_movements
           (organization_id, account_id, movement_type, points_delta,
            balance_after, reason, source_type, user_id)
         VALUES ($1,$2,'adjust',$3,$4,$5,'manual',$6)`,
        [g.user.organizationId, accId, delta, next, reason, g.user.id],
      );
      await client.query(
        `UPDATE loyalty_accounts SET points_balance = $1, updated_at = now() WHERE id = $2`,
        [next, accId],
      );
      return { balance: next };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'loyalty.adjust', entityType: 'customer', entityId: params.id,
      payload: { amount_euros: delta, reason, new_balance: result.balance },
    });
    return NextResponse.json(result);
  } catch (err) {
    if ((err as Error).message === 'SOLDE_NEGATIF') {
      return NextResponse.json(
        { error: 'SOLDE_NEGATIF', message: 'Le solde fidélité ne peut pas devenir négatif.' },
        { status: 400 },
      );
    }
    // eslint-disable-next-line no-console
    console.error('[loyalty.adjust]', err);
    return jsonError('INTERNAL_ERROR', 500);
  }
}
