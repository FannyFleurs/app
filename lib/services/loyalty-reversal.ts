import type { PoolClient } from 'pg';
import { withTransaction } from '@/lib/db/client';
import { round2 } from './money';

/**
 * Corrections fidélité ciblées sur UNE vente déjà validée, SANS toucher aux
 * articles, règlements ou facture — contrairement à l'annulation complète
 * (SaleCancelService.cancelSale), qui défait toute la vente.
 *
 * Deux actions indépendantes, chacune ne concernant qu'UN sens du mouvement
 * fidélité de la vente :
 *   - removeLoyaltyAdvantage : annule le « redeem » (points DÉPENSÉS en
 *     règlement sur cette vente), recrédités au client. Les points
 *     éventuellement gagnés sur le même achat restent acquis.
 *   - removeLoyaltyEarn : annule le « earn » (points GAGNÉS pour cet achat),
 *     repris au client. Les points éventuellement dépensés sur la même
 *     vente restent consommés.
 *
 * Même principe de contre-passation que sale-cancel-service.ts : une
 * NOUVELLE écriture dans loyalty_movements, jamais de modification des
 * mouvements d'origine. L'idempotence se vérifie par le préfixe du motif
 * (et non le signe du delta : reprendre des points déjà partiellement
 * dépensés ailleurs peut légitimement produire un delta nul — un repli sur
 * le signe manquerait alors ce cas).
 */

const ADVANTAGE_REASON_PREFIX = 'Retrait avantage fidélité';
const EARN_REASON_PREFIX = 'Retrait points acquis';

async function lockSaleWithCustomer(client: PoolClient, args: {
  organizationId: string; saleId: string;
}): Promise<{ id: string; receipt_number: string }> {
  const saleRes = await client.query<{
    id: string; status: string; customer_id: string | null; receipt_number: string;
  }>(
    `SELECT id, status, customer_id, receipt_number FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [args.saleId, args.organizationId],
  );
  if (saleRes.rowCount === 0) throw new Error('SALE_NOT_FOUND');
  const sale = saleRes.rows[0]!;
  if (sale.status !== 'validated') throw new Error('SALE_NOT_VALIDATED');
  if (!sale.customer_id) throw new Error('NO_CUSTOMER');
  return sale;
}

/** Retire l'avantage fidélité (points DÉPENSÉS) d'une vente — voir en-tête. */
export async function removeLoyaltyAdvantage(args: {
  organizationId: string;
  userId: string;
  saleId: string;
}): Promise<{ removed_amount: number; new_balance: number }> {
  return withTransaction(async (client) => {
    const sale = await lockSaleWithCustomer(client, args);

    const lm = await client.query<{ account_id: string; movement_type: string; points_delta: string; reason: string | null }>(
      `SELECT account_id, movement_type, points_delta::text, reason
         FROM loyalty_movements
        WHERE source_type = 'sale' AND source_id = $1
        ORDER BY created_at`,
      [sale.id],
    );
    if (lm.rowCount === 0) throw new Error('NO_LOYALTY_ADVANTAGE');
    const accountId = lm.rows[0]!.account_id;
    const redeemed = lm.rows
      .filter((r) => r.movement_type === 'redeem')
      .reduce((s, r) => s + Math.abs(Number(r.points_delta)), 0);
    if (redeemed <= 0) throw new Error('NO_LOYALTY_ADVANTAGE');
    const alreadyRemoved = lm.rows.some((r) => r.movement_type === 'adjust' && r.reason?.startsWith(ADVANTAGE_REASON_PREFIX));
    if (alreadyRemoved) throw new Error('ALREADY_REMOVED');

    const accSel = await client.query<{ points_balance: string }>(
      `SELECT points_balance::text FROM loyalty_accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    const current = Number(accSel.rows[0]?.points_balance ?? 0);
    const target = round2(current + redeemed);

    await client.query(
      `INSERT INTO loyalty_movements
         (organization_id, account_id, movement_type, points_delta, balance_after,
          reason, source_type, source_id, user_id)
       VALUES ($1,$2,'adjust',$3,$4,$5,'sale',$6,$7)`,
      [args.organizationId, accountId, redeemed, target,
       `${ADVANTAGE_REASON_PREFIX} — vente ${sale.receipt_number}`, sale.id, args.userId],
    );
    await client.query(
      `UPDATE loyalty_accounts SET points_balance = $1, updated_at = now() WHERE id = $2`,
      [target, accountId],
    );

    return { removed_amount: redeemed, new_balance: target };
  });
}

/**
 * Retire les points fidélité ACQUIS (gagnés) sur une vente — l'inverse de
 * removeLoyaltyAdvantage. Repris dans la limite du solde actuel du client
 * (s'il a déjà dépensé ces points ailleurs, on ne va jamais sous zéro —
 * même règle que la contre-passation complète de SaleCancelService).
 */
export async function removeLoyaltyEarn(args: {
  organizationId: string;
  userId: string;
  saleId: string;
}): Promise<{ removed_amount: number; new_balance: number }> {
  return withTransaction(async (client) => {
    const sale = await lockSaleWithCustomer(client, args);

    const lm = await client.query<{ account_id: string; movement_type: string; points_delta: string; reason: string | null }>(
      `SELECT account_id, movement_type, points_delta::text, reason
         FROM loyalty_movements
        WHERE source_type = 'sale' AND source_id = $1
        ORDER BY created_at`,
      [sale.id],
    );
    if (lm.rowCount === 0) throw new Error('NO_LOYALTY_EARNED');
    const accountId = lm.rows[0]!.account_id;
    const earned = lm.rows
      .filter((r) => r.movement_type === 'earn')
      .reduce((s, r) => s + Number(r.points_delta), 0);
    if (earned <= 0) throw new Error('NO_LOYALTY_EARNED');
    const alreadyRemoved = lm.rows.some((r) => r.movement_type === 'adjust' && r.reason?.startsWith(EARN_REASON_PREFIX));
    if (alreadyRemoved) throw new Error('ALREADY_REMOVED');

    const accSel = await client.query<{ points_balance: string }>(
      `SELECT points_balance::text FROM loyalty_accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    const current = Number(accSel.rows[0]?.points_balance ?? 0);
    // Repris dans la limite de ce qui est VRAIMENT disponible : jamais plus
    // que `earned`, jamais plus que le solde actuel (si déjà négatif ou
    // partiellement entamé par une autre vente, on ne descend pas plus bas).
    const reclaim = round2(Math.min(earned, Math.max(0, current)));
    const target = round2(current - reclaim);

    await client.query(
      `INSERT INTO loyalty_movements
         (organization_id, account_id, movement_type, points_delta, balance_after,
          reason, source_type, source_id, user_id)
       VALUES ($1,$2,'adjust',$3,$4,$5,'sale',$6,$7)`,
      [args.organizationId, accountId, -reclaim, target,
       `${EARN_REASON_PREFIX} — vente ${sale.receipt_number}`, sale.id, args.userId],
    );
    await client.query(
      `UPDATE loyalty_accounts SET points_balance = $1, updated_at = now() WHERE id = $2`,
      [target, accountId],
    );

    return { removed_amount: reclaim, new_balance: target };
  });
}
