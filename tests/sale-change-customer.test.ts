// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Ma Journée : le bouton « + Attribuer un client » permettait de rattacher un
 * client à une vente déjà validée (oubli en caisse), mais pas de le CHANGER
 * en cas d'erreur d'attribution — l'API refusait (CUSTOMER_ALREADY_ATTACHED)
 * dès qu'un client était déjà présent.
 *
 * Corrigé : POST /api/sales/[id]/attach-customer accepte maintenant de
 * remplacer un client déjà attaché, à deux conditions :
 *  - aucune facture n'a encore été émise pour cette vente (sinon elle
 *    resterait au nom de l'ancien client — incohérence facture/vente) ;
 *  - le gain fidélité déjà crédité à l'ancien client pour CETTE vente est
 *    contre-passé avant de créditer le nouveau (même mécanisme que
 *    l'annulation de vente, lib/services/sale-cancel-service.ts), pour ne
 *    jamais laisser les points sur le mauvais compte.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: attachCustomer } = await import('@/app/api/sales/[id]/attach-customer/route');
const { GET: getSaleDetail } = await import('@/app/api/sales/[id]/route');

describe.skipIf(!hasDb)('Ma Journée — changer le client d\'une vente déjà validée', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let customerAId: string;
  let customerBId: string;

  async function makeSale(totalTtc: number): Promise<string> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         validated_at, total_ttc, total_ht, receipt_number)
       VALUES ($1, $2, $3, $4, 'validated', now(), $5, $5, $6) RETURNING id`,
      [organizationId, storeId, registerId, userId, totalTtc, `R-${randomUUID().slice(0, 8)}`],
    );
    return sale.rows[0]!.id;
  }

  function post(saleId: string, customerId: string) {
    return attachCustomer(
      new Request(`https://x.test/api/sales/${saleId}/attach-customer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      }),
      { params: { id: saleId } },
    );
  }

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Change Customer ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;

    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `scc-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const custA = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name) VALUES ($1, 'particulier', 'Alice', 'A') RETURNING id`,
      [organizationId],
    );
    customerAId = custA.rows[0]!.id;
    const custB = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name) VALUES ($1, 'particulier', 'Bob', 'B') RETURNING id`,
      [organizationId],
    );
    customerBId = custB.rows[0]!.id;

    // Fidélité activée : 5€ crédités tous les 100€ dépensés.
    await query(
      `INSERT INTO settings (organization_id, key, value)
       VALUES ($1, 'pos_ui', $2::jsonb)`,
      [organizationId, JSON.stringify({ loyalty: { enabled: true, euros_earned: 5, per_euros_spent: 100 } })],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('attribue un client à une vente qui n\'en a aucun (comportement existant, non régressé)', async () => {
    const saleId = await makeSale(50);
    const res = await post(saleId, customerAId);
    expect(res.status).toBe(200);
    const body = await res.json() as { customer_id: string };
    expect(body.customer_id).toBe(customerAId);

    const row = await query<{ customer_id: string }>(`SELECT customer_id FROM sales WHERE id = $1`, [saleId]);
    expect(row.rows[0]!.customer_id).toBe(customerAId);
  });

  it('change le client d\'une vente qui en a déjà un, et contre-passe la fidélité de l\'ancien au profit du nouveau', async () => {
    // Clients dédiés (soldes vierges) pour ne pas dépendre des points déjà
    // gagnés par customerAId/customerBId dans les autres cas de ce fichier.
    const custC = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name) VALUES ($1, 'particulier', 'Chloé', 'C') RETURNING id`,
      [organizationId],
    );
    const custD = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name) VALUES ($1, 'particulier', 'David', 'D') RETURNING id`,
      [organizationId],
    );
    const customerCId = custC.rows[0]!.id;
    const customerDId = custD.rows[0]!.id;

    const saleId = await makeSale(100); // 100€ → 5€ de fidélité attendus
    const first = await post(saleId, customerCId);
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { loyalty: { earned: number; new_balance: number } | null };
    expect(firstBody.loyalty).toEqual({ earned: 5, new_balance: 5 });

    const second = await post(saleId, customerDId);
    expect(second.status).toBe(200);
    const secondBody = await second.json() as { customer_id: string; loyalty: { earned: number; new_balance: number } | null };
    expect(secondBody.customer_id).toBe(customerDId);
    expect(secondBody.loyalty).toEqual({ earned: 5, new_balance: 5 }); // D reçoit son propre gain

    const row = await query<{ customer_id: string }>(`SELECT customer_id FROM sales WHERE id = $1`, [saleId]);
    expect(row.rows[0]!.customer_id).toBe(customerDId);

    // Le solde fidélité de C est revenu à 0 (contre-passé), celui de D est à 5.
    const balC = await query<{ points_balance: string }>(
      `SELECT points_balance FROM loyalty_accounts WHERE customer_id = $1`, [customerCId],
    );
    expect(Number(balC.rows[0]!.points_balance)).toBe(0);
    const balD = await query<{ points_balance: string }>(
      `SELECT points_balance FROM loyalty_accounts WHERE customer_id = $1`, [customerDId],
    );
    expect(Number(balD.rows[0]!.points_balance)).toBe(5);
  });

  it('rechoisir le MÊME client ne fait rien (pas d\'erreur, pas de mouvement fidélité en double)', async () => {
    const saleId = await makeSale(50);
    await post(saleId, customerAId);
    const res = await post(saleId, customerAId);
    expect(res.status).toBe(200);

    const moves = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM loyalty_movements lm
         JOIN loyalty_accounts la ON la.id = lm.account_id
        WHERE la.customer_id = $1 AND lm.source_id = $2`,
      [customerAId, saleId],
    );
    expect(moves.rows[0]!.count).toBe('1'); // un seul 'earn', pas de second mouvement
  });

  it('refuse de changer le client une fois une facture émise pour cette vente', async () => {
    const saleId = await makeSale(80);
    await post(saleId, customerAId);
    await query(
      `INSERT INTO invoices (organization_id, store_id, customer_id, sale_id, status, total_ht, total_tva, total_ttc)
       VALUES ($1, $2, $3, $4, 'validated', 72.73, 7.27, 80)`,
      [organizationId, storeId, customerAId, saleId],
    );

    const res = await post(saleId, customerBId);
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVOICE_ALREADY_GENERATED');

    const row = await query<{ customer_id: string }>(`SELECT customer_id FROM sales WHERE id = $1`, [saleId]);
    expect(row.rows[0]!.customer_id).toBe(customerAId); // inchangé
  });

  it('une facture ANNULÉE ne bloque pas le changement de client', async () => {
    const saleId = await makeSale(30);
    await post(saleId, customerAId);
    await query(
      `INSERT INTO invoices (organization_id, store_id, customer_id, sale_id, status, total_ht, total_tva, total_ttc)
       VALUES ($1, $2, $3, $4, 'cancelled', 27.27, 2.73, 30)`,
      [organizationId, storeId, customerAId, saleId],
    );

    const res = await post(saleId, customerBId);
    expect(res.status).toBe(200);
    const row = await query<{ customer_id: string }>(`SELECT customer_id FROM sales WHERE id = $1`, [saleId]);
    expect(row.rows[0]!.customer_id).toBe(customerBId);
  });

  it('GET /api/sales/[id] : le détail résout le nom du vendeur et du client (pas seulement leurs id)', async () => {
    // Bug trouvé en construisant « Changer de client » : SELECT * FROM sales
    // ne renvoie que user_id/customer_id, jamais de nom — « Vendeur : » et
    // « Client : » restaient vides dans le détail d'une vente (Ma Journée),
    // et le nouveau rappel « Client actuel : X » de la modale « Changer de
    // client » ne pouvait jamais s'afficher.
    const saleId = await makeSale(20);
    await post(saleId, customerAId);
    const res = await getSaleDetail(
      new Request(`https://x.test/api/sales/${saleId}`),
      { params: { id: saleId } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { sale: { cashier: string | null; customer: string | null } };
    expect(body.sale.cashier).toBe('Testeur');
    expect(body.sale.customer).toBe('Alice A');
  });
});
