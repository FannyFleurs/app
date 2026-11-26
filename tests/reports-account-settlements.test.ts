// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Rapport « Règlements de comptes » : un utilisateur a réglé un solde client
 * en espèces sans que personne ne puisse retrouver qui, pour quel client, ni
 * combien — aucun écran existant ne liste les règlements au-delà d'une seule
 * boutique/jour/mode (voir PaymentDrilldownModal, qui en plus EXCLUT les
 * espèces). Ce rapport couvre n'importe quelle période/boutique, espèces
 * comprises.
 *
 * Intégration contre une VRAIE base Postgres, même conventions que
 * tests/closure-payment-drilldown.test.ts.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: accountSettlementsGet } = await import('@/app/api/reports/account-settlements/route');

describe.skipIf(!hasDb)('Rapport Règlements de comptes clients', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let cashierId: string;
  let customerId: string;
  const DAY = '2026-03-10';

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Account Settlements Report ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'B', 'Boutique B') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;
    const cashier = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Camille Vendeuse', 'owner') RETURNING id`,
      [organizationId, `rasr-${randomUUID()}@example.test`],
    );
    cashierId = cashier.rows[0]!.id;
    currentUser = { id: cashierId, organizationId, email: 'x', fullName: 'Camille Vendeuse', role: 'owner' };
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name) VALUES ($1, 'Jean', 'Dupont') RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  async function settlement(method: string, amount: number, createdAt: string, storeId = storeAId, reference: string | null = null) {
    await query(
      `INSERT INTO account_settlement_payments
         (organization_id, customer_id, store_id, user_id, method, amount, reference, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
      [organizationId, customerId, storeId, cashierId, method, amount, reference, createdAt],
    );
  }

  function req(qs: string): Request {
    return new Request(`https://x.test/api/reports/account-settlements?${qs}`);
  }

  it("un règlement en ESPÈCES apparaît, avec qui l'a saisi, le client, le montant — ce qu'aucun autre écran ne montre", async () => {
    await settlement('cash', 80, `${DAY}T16:30:00Z`);
    const res = await accountSettlementsGet(req(`from=${DAY}&to=${DAY}`));
    const body = await res.json() as { lines: Array<{ cashier: string | null; customer: string | null; method: string; amount: number }> };
    const row = body.lines.find((l) => l.method === 'cash' && l.amount === 80);
    expect(row).toMatchObject({ cashier: 'Camille Vendeuse', customer: 'Jean Dupont', method: 'cash', amount: 80 });
  });

  it('le filtre boutique exclut les règlements des autres boutiques', async () => {
    await settlement('card', 42, `${DAY}T10:00:00Z`, storeBId, 'F-ONLY-B');
    const resA = await accountSettlementsGet(req(`from=${DAY}&to=${DAY}&store_id=${storeAId}`));
    const bodyA = await resA.json() as { lines: Array<{ reference: string | null }> };
    expect(bodyA.lines.some((l) => l.reference === 'F-ONLY-B')).toBe(false);

    const resB = await accountSettlementsGet(req(`from=${DAY}&to=${DAY}&store_id=${storeBId}`));
    const bodyB = await resB.json() as { lines: Array<{ reference: string | null }> };
    expect(bodyB.lines.some((l) => l.reference === 'F-ONLY-B')).toBe(true);
  });

  it('la période exclut les règlements hors plage', async () => {
    await settlement('check', 30, '2025-01-01T09:00:00Z', storeAId, 'F-OLD');
    const res = await accountSettlementsGet(req(`from=${DAY}&to=${DAY}`));
    const body = await res.json() as { lines: Array<{ reference: string | null }> };
    expect(body.lines.some((l) => l.reference === 'F-OLD')).toBe(false);
  });

  it('les totaux cumulent le montant et le détaillent par moyen de règlement', async () => {
    const res = await accountSettlementsGet(req(`from=${DAY}&to=${DAY}&store_id=${storeAId}`));
    const body = await res.json() as { totals: { count: number; amount: number; by_method: Record<string, number> } };
    // Sur storeA, ce jour-là : 80 en espèces (1er test) — le reste des tests
    // précédents vise storeB ou une autre date.
    expect(body.totals.by_method.cash).toBe(80);
    expect(body.totals.amount).toBeGreaterThanOrEqual(80);
    expect(body.totals.count).toBeGreaterThanOrEqual(1);
  });
});
