// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Détail des paiements d'un mode de règlement à la clôture (pointage 1 à 1
 * des tickets en cas d'écart de caisse) — voir lib/services/closure-preview.ts
 * (listClosurePayments) et app/(app)/closures/PaymentDrilldownModal.tsx.
 *
 * Garantie centrale : la somme du détail renvoyé DOIT toujours correspondre
 * exactement au total affiché par la réconciliation (computeClosurePreview),
 * sinon le détail sèmerait plus de confusion qu'il n'en résout. Les deux
 * doivent utiliser le même périmètre (store_id/date/periodStart).
 *
 * Intégration contre une VRAIE base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { listClosurePayments, computeClosurePreview } = await import('@/lib/services/closure-preview');
const { GET: getDrilldown } = await import('@/app/api/closures/daily/payments/route');

describe('Détail des paiements à la clôture — pointage 1 à 1', () => {
  let organizationId: string;
  let storeId: string;
  let otherStoreId: string;
  let registerId: string;
  let userId: string;
  let customerId: string;
  const DATE = '2026-03-10';
  const OTHER_DATE = '2026-03-09';

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Closure Drilldown ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'B', 'Boutique B') RETURNING id`,
      [organizationId],
    );
    otherStoreId = storeB.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Vendeuse Test', 'owner') RETURNING id`,
      [organizationId, `cpd-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Vendeuse Test', role: 'owner' };
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name) VALUES ($1, 'Jean', 'Dupont') RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;

    async function sale(amount: number, method: string, validatedAt: string, storeOverride?: string) {
      const s = await query<{ id: string }>(
        `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
           validated_at, total_ttc, total_ht, total_tva, receipt_number)
         VALUES ($1, $2, $3, $4, 'validated', $5, $6, $6, 0, $7) RETURNING id`,
        [organizationId, storeOverride ?? storeId, registerId, userId, validatedAt, amount, `T-${randomUUID().slice(0, 8)}`],
      );
      await query(
        `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1, $2, $3, $4)`,
        [organizationId, s.rows[0]!.id, method, amount],
      );
    }

    // Deux ventes CB le 10/03, dans la boutique A — celles attendues dans le détail.
    await sale(20, 'card', `${DATE}T09:15:00Z`);
    await sale(35.5, 'card', `${DATE}T14:42:00Z`);
    // Une vente chèque le même jour (ne doit PAS apparaître dans le détail CB).
    await sale(10, 'check', `${DATE}T10:00:00Z`);
    // Une vente CB la veille (hors périmètre date).
    await sale(99, 'card', `${OTHER_DATE}T10:00:00Z`);
    // Une vente CB le même jour, mais dans une AUTRE boutique (hors périmètre store).
    await sale(77, 'card', `${DATE}T11:00:00Z`, otherStoreId);

    // Règlement de solde « en compte » en CB le même jour (doit apparaître,
    // même somme totale que la réconciliation).
    await query(
      `INSERT INTO account_settlement_payments
         (organization_id, customer_id, store_id, user_id, method, amount, reference, created_at)
       VALUES ($1, $2, $3, $4, 'card', 15, 'FACT-0099', $5)`,
      [organizationId, customerId, storeId, userId, `${DATE}T16:00:00Z`],
    );
    // Règlement de solde en ESPÈCES le même jour (toujours exclu, même mode
    // 'cash' — déjà tracé via cash_movements, voir account-settlements.ts).
    await query(
      `INSERT INTO account_settlement_payments
         (organization_id, customer_id, store_id, user_id, method, amount, created_at)
       VALUES ($1, $2, $3, $4, 'cash', 5, $5)`,
      [organizationId, customerId, storeId, userId, `${DATE}T16:30:00Z`],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('renvoie exactement les 3 paiements CB du jour/boutique (2 ventes + 1 règlement de solde), triés chronologiquement', async () => {
    const rows = await listClosurePayments(storeId, DATE, 'card');
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.amount)).toEqual([20, 35.5, 15]);
    expect(rows.map((r) => r.kind)).toEqual(['sale', 'sale', 'settlement']);
    expect(rows[0]!.receipt_number).toMatch(/^T-/);
    expect(rows[0]!.cashier_name).toBe('Vendeuse Test');
    expect(rows[2]!.customer_name).toBe('Jean Dupont');
    expect(rows[2]!.reference).toBe('FACT-0099');
  });

  it("exclut la vente chèque, la vente de la veille, la vente d'une autre boutique, et le règlement en espèces", async () => {
    const rows = await listClosurePayments(storeId, DATE, 'card');
    expect(rows.some((r) => r.amount === 99)).toBe(false);
    expect(rows.some((r) => r.amount === 77)).toBe(false);
    expect(rows.some((r) => r.amount === 5)).toBe(false);
    expect(rows.length).toBe(3);
  });

  it('un mode sans règlement de solde (chèque) ne renvoie que les ventes', async () => {
    const rows = await listClosurePayments(storeId, DATE, 'check');
    expect(rows.length).toBe(1);
    expect(rows[0]!.amount).toBe(10);
    expect(rows[0]!.kind).toBe('sale');
  });

  it('la somme du détail correspond EXACTEMENT au total affiché par la réconciliation (computeClosurePreview)', async () => {
    const preview = await computeClosurePreview(storeId, DATE);
    const cardSummary = preview.payments.find((p) => p.method === 'card')!;
    const rows = await listClosurePayments(storeId, DATE, 'card');
    const sum = Number(rows.reduce((s, r) => s + r.amount, 0).toFixed(2));
    expect(sum).toBe(cardSummary.total);
    expect(rows.length).toBe(cardSummary.count);
  });

  it('GET /api/closures/daily/payments renvoie le même détail', async () => {
    const res = await getDrilldown(new Request(
      `https://x.test/api/closures/daily/payments?store_id=${storeId}&date=${DATE}&method=card`,
    ));
    expect(res.status).toBe(200);
    const { payments } = await res.json();
    expect(payments.length).toBe(3);
  });

  it('GET sans method requis renvoie 400', async () => {
    const res = await getDrilldown(new Request(
      `https://x.test/api/closures/daily/payments?store_id=${storeId}&date=${DATE}`,
    ));
    expect(res.status).toBe(400);
  });
});
