// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { removeLoyaltyEarn } from '@/lib/services/loyalty-reversal';

/**
 * « Retirer points acquis » (Ma journée) : l'inverse de « Retirer avantage
 * fid » — retire les points fidélité GAGNÉS sur une vente, sans toucher aux
 * articles, paiements ou facture. Les points éventuellement DÉPENSÉS sur la
 * même vente restent consommés (l'achat n'est pas remis en cause).
 *
 * Repris dans la limite du solde actuel : si le client a déjà dépensé ces
 * points ailleurs, on ne va jamais sous zéro (même règle que la
 * contre-passation complète de SaleCancelService).
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: removeRoute } = await import('@/app/api/sales/[id]/remove-loyalty-earn/route');
const { GET: saleDetailRoute } = await import('@/app/api/sales/[id]/route');

describe.skipIf(!hasDb)('Retirer points acquis (Ma journée)', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let customerId: string;
  let accountId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Loyalty Earn Remove ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1,$2,'R1','Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `loy-earn-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name) VALUES ($1,'Jean','Dupont') RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
    const account = await query<{ id: string }>(
      `INSERT INTO loyalty_accounts (organization_id, customer_id, points_balance) VALUES ($1,$2,0) RETURNING id`,
      [organizationId, customerId],
    );
    accountId = account.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  /** Même simulation que loyalty-remove-advantage.test.ts (pas de duplication
   *  de SaleService.validate — test ciblé sur la réversibilité fidélité). */
  async function makeSaleWithLoyalty(earned: number, redeemed = 0): Promise<string> {
    const total = earned + 20;
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
         total_ht, total_tva, total_ttc, tva_breakdown, validated_at, receipt_number)
       VALUES ($1,$2,$3,$4,$5,'validated', $6, 0, $6, '[]'::jsonb, now(), $7) RETURNING id`,
      [organizationId, storeId, registerId, userId, customerId, total, `R-${randomUUID().slice(0, 8)}`],
    );
    const saleId = sale.rows[0]!.id;
    if (redeemed > 0) {
      const bal = await query<{ points_balance: string }>(
        `UPDATE loyalty_accounts SET points_balance = points_balance - $1 WHERE id = $2 RETURNING points_balance::text`,
        [redeemed, accountId],
      );
      await query(
        `INSERT INTO loyalty_movements (organization_id, account_id, movement_type, points_delta, balance_after, source_type, source_id, user_id)
         VALUES ($1,$2,'redeem',$3,$4,'sale',$5,$6)`,
        [organizationId, accountId, -redeemed, bal.rows[0]!.points_balance, saleId, userId],
      );
    }
    if (earned > 0) {
      const bal = await query<{ points_balance: string }>(
        `UPDATE loyalty_accounts SET points_balance = points_balance + $1 WHERE id = $2 RETURNING points_balance::text`,
        [earned, accountId],
      );
      await query(
        `INSERT INTO loyalty_movements (organization_id, account_id, movement_type, points_delta, balance_after, source_type, source_id, user_id)
         VALUES ($1,$2,'earn',$3,$4,'sale',$5,$6)`,
        [organizationId, accountId, earned, bal.rows[0]!.points_balance, saleId, userId],
      );
    }
    return saleId;
  }

  it('reprend les points gagnés, sans toucher aux points dépensés sur la même vente', async () => {
    // Solde de départ confortable (points d'un achat antérieur), pour que le
    // redeem de cette vente ne pousse jamais le compte sous zéro — ce cas-là
    // est couvert séparément par le test suivant.
    await query(`UPDATE loyalty_accounts SET points_balance = 20 WHERE id = $1`, [accountId]);

    const saleId = await makeSaleWithLoyalty(3, 8);
    // Après la vente : 20 + 3 (earn) - 8 (redeem) = 15.
    const out = await removeLoyaltyEarn({ organizationId, userId, saleId });
    expect(out.removed_amount).toBe(3);
    expect(out.new_balance).toBe(12); // 15 - 3

    const after = await query<{ points_balance: string }>(`SELECT points_balance::text FROM loyalty_accounts WHERE id = $1`, [accountId]);
    expect(Number(after.rows[0]!.points_balance)).toBe(12);
  });

  it('ne va jamais sous zéro si le client a déjà dépensé ces points ailleurs', async () => {
    const saleId = await makeSaleWithLoyalty(10);
    // Le client dépense la totalité de son solde AVANT le retrait (ailleurs,
    // sans lien avec cette vente) : son solde retombe à 0.
    await query(`UPDATE loyalty_accounts SET points_balance = 0 WHERE id = $1`, [accountId]);

    const out = await removeLoyaltyEarn({ organizationId, userId, saleId });
    expect(out.new_balance).toBe(0);
    expect(out.removed_amount).toBe(0); // rien à reprendre, le solde était déjà à 0

    // Un second retrait reste refusé (déjà traité), même avec un delta nul.
    await expect(removeLoyaltyEarn({ organizationId, userId, saleId })).rejects.toThrow('ALREADY_REMOVED');
  });

  it('refuse un second retrait sur la même vente (ALREADY_REMOVED)', async () => {
    const saleId = await makeSaleWithLoyalty(5);
    await removeLoyaltyEarn({ organizationId, userId, saleId });
    await expect(removeLoyaltyEarn({ organizationId, userId, saleId })).rejects.toThrow('ALREADY_REMOVED');
  });

  it('refuse une vente sans points gagnés (NO_LOYALTY_EARNED)', async () => {
    const saleId = await makeSaleWithLoyalty(0, 4);
    await expect(removeLoyaltyEarn({ organizationId, userId, saleId })).rejects.toThrow('NO_LOYALTY_EARNED');
  });

  it('la route expose le bon statut pour chaque cas d\'erreur', async () => {
    const saleId = await makeSaleWithLoyalty(4);
    const ok = await removeRoute(new Request('https://x.test', { method: 'POST' }), { params: { id: saleId } });
    expect(ok.status).toBe(200);
    const again = await removeRoute(new Request('https://x.test', { method: 'POST' }), { params: { id: saleId } });
    expect(again.status).toBe(409);
    const notFound = await removeRoute(new Request('https://x.test', { method: 'POST' }), { params: { id: randomUUID() } });
    expect(notFound.status).toBe(404);
  });

  it('le détail de vente expose loyalty.earnRemovable, qui bascule à false après retrait, indépendamment de removable', async () => {
    const saleId = await makeSaleWithLoyalty(7, 2);
    const before = await saleDetailRoute(new Request('https://x.test'), { params: { id: saleId } });
    const beforeBody = await before.json() as {
      loyalty: { redeemed: number; removable: boolean; earned: number; earnRemovable: boolean };
    };
    expect(beforeBody.loyalty).toEqual({ redeemed: 2, removable: true, earned: 7, earnRemovable: true });

    await removeLoyaltyEarn({ organizationId, userId, saleId });

    const after = await saleDetailRoute(new Request('https://x.test'), { params: { id: saleId } });
    const afterBody = await after.json() as {
      loyalty: { redeemed: number; removable: boolean; earned: number; earnRemovable: boolean };
    };
    // earnRemovable passe à false ; removable (l'avantage dépensé) reste
    // intact — les deux retraits sont bien indépendants.
    expect(afterBody.loyalty).toEqual({ redeemed: 2, removable: true, earned: 7, earnRemovable: false });
  });
});
