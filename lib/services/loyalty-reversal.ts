import { withTransaction } from '@/lib/db/client';
import { round2 } from './money';

/**
 * Retire l'avantage fidélité (points dépensés) d'une vente validée, SANS
 * toucher aux articles, paiements ou facture — contrairement à l'annulation
 * complète (SaleCancelService.cancelSale), qui défait toute la vente.
 *
 * Ne concerne que le « redeem » (points dépensés en règlement sur cette
 * vente) : les points éventuellement GAGNÉS pour cet achat restent acquis,
 * l'achat lui-même n'étant pas remis en cause. Les points dépensés sont
 * recrédités au client — même principe de contre-passation que
 * sale-cancel-service.ts (nouvelle écriture dans loyalty_movements, jamais
 * de modification des mouvements d'origine).
 */
export async function removeLoyaltyAdvantage(args: {
  organizationId: string;
  userId: string;
  saleId: string;
}): Promise<{ removed_amount: number; new_balance: number }> {
  return withTransaction(async (client) => {
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

    const lm = await client.query<{ account_id: string; movement_type: string; points_delta: string }>(
      `SELECT account_id, movement_type, points_delta::text
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
    // Déjà retiré : un mouvement d'ajustement POSITIF lié à cette vente existe
    // déjà (seule écriture que CETTE action produit — earn/redeem d'origine
    // sont toujours négatif/positif historiques, jamais rejoués).
    const alreadyRemoved = lm.rows.some((r) => r.movement_type === 'adjust' && Number(r.points_delta) > 0);
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
       `Retrait avantage fidélité — vente ${sale.receipt_number}`, sale.id, args.userId],
    );
    await client.query(
      `UPDATE loyalty_accounts SET points_balance = $1, updated_at = now() WHERE id = $2`,
      [target, accountId],
    );

    return { removed_amount: redeemed, new_balance: target };
  });
}
