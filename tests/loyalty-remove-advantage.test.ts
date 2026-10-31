// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { removeLoyaltyAdvantage } from '@/lib/services/loyalty-reversal';

/**
 * « Retirer avantage fid » (Ma journée) : retire les points fidélité
 * DÉPENSÉS sur une vente, sans toucher aux articles, paiements ou facture —
 * contrairement à l'annulation complète de la vente. Les points
 * éventuellement GAGNÉS sur cette même vente restent acquis (l'achat n'est
 * pas remis en cause, seul le bon de réduction fidélité l'est).
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: removeRoute } = await import('@/app/api/sales/[id]/remove-loyalty-advantage/route');
const { GET: saleDetailRoute } = await import('@/app/api/sales/[id]/route');

describe.skipIf(!hasDb)('Retirer avantage fidélité (Ma journée)', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let customerId: string;
  let accountId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Loyalty Remove ${randomUUID()}`],
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
      [organizationId, `loy-rm-${randomUUID()}@example.test`],
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

  /** Simule une vente validée ayant dépensé `redeemed` € de fidélité, et
   *  éventuellement gagné `earned` € sur cet achat (comme le ferait
   *  SaleService.validate — reproduit ici sans repasser par tout le flux de
   *  vente, pour un test ciblé sur la réversibilité fidélité). */
  async function makeSaleWithLoyalty(redeemed: number, earned = 0): Promise<string> {
    const total = redeemed + 20;
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
         total_ht, total_tva, total_ttc, tva_breakdown, validated_at, receipt_number)
       VALUES ($1,$2,$3,$4,$5,'validated', $6, 0, $6, '[]'::jsonb, now(), $7) RETURNING id`,
      [organizationId, storeId, registerId, userId, customerId, total, `R-${randomUUID().slice(0, 8)}`],
    );
    const saleId = sale.rows[0]!.id;
    if (redeemed > 0) {
      await query(
        `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1,$2,'loyalty',$3)`,
        [organizationId, saleId, redeemed],
      );
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

  it('recrédite les points dépensés, sans toucher aux points gagnés sur la même vente', async () => {
    const before = await query<{ points_balance: string }>(`SELECT points_balance::text FROM loyalty_accounts WHERE id = $1`, [accountId]);
    const startBalance = Number(before.rows[0]!.points_balance);

    const saleId = await makeSaleWithLoyalty(8, 3);
    const out = await removeLoyaltyAdvantage({ organizationId, userId, saleId });
    expect(out.removed_amount).toBe(8);

    const after = await query<{ points_balance: string }>(`SELECT points_balance::text FROM loyalty_accounts WHERE id = $1`, [accountId]);
    // startBalance avait déjà absorbé -8 (redeem) +3 (earn) = -5 net ; le
    // retrait ne recrédite QUE les 8 dépensés, donc balance = start - 5 + 8.
    expect(Number(after.rows[0]!.points_balance)).toBe(round2(startBalance - 8 + 3 + 8));
  });

  it('refuse un second retrait sur la même vente (ALREADY_REMOVED)', async () => {
    const saleId = await makeSaleWithLoyalty(5);
    await removeLoyaltyAdvantage({ organizationId, userId, saleId });
    await expect(removeLoyaltyAdvantage({ organizationId, userId, saleId })).rejects.toThrow('ALREADY_REMOVED');
  });

  it('refuse une vente sans avantage fidélité (NO_LOYALTY_ADVANTAGE)', async () => {
    const saleId = await makeSaleWithLoyalty(0);
    await expect(removeLoyaltyAdvantage({ organizationId, userId, saleId })).rejects.toThrow('NO_LOYALTY_ADVANTAGE');
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

  it('le détail de vente expose loyalty.removable, qui bascule à false après retrait', async () => {
    const saleId = await makeSaleWithLoyalty(6);
    const before = await saleDetailRoute(new Request('https://x.test'), { params: { id: saleId } });
    const beforeBody = await before.json() as { loyalty: { redeemed: number; removable: boolean } };
    expect(beforeBody.loyalty).toMatchObject({ redeemed: 6, removable: true });

    await removeLoyaltyAdvantage({ organizationId, userId, saleId });

    const after = await saleDetailRoute(new Request('https://x.test'), { params: { id: saleId } });
    const afterBody = await after.json() as { loyalty: { redeemed: number; removable: boolean } };
    expect(afterBody.loyalty).toMatchObject({ redeemed: 6, removable: false });
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
