// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * GET /api/customers/[id] renvoie désormais `stores` : la ou les boutiques
 * où ce client a déjà acheté — constaté depuis `sales`, jamais un champ
 * propre au client (customers n'a pas de store_id). Sert les puces
 * « boutique(s) d'achat » de la fiche client (CustomersList.tsx).
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: customerGet } = await import('@/app/api/customers/[id]/route');

describe.skipIf(!hasDb)('GET /api/customers/[id] — boutique(s) d\'achat constatées', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let registerId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Customer Stores ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeAId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `cds-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  async function newCustomer(): Promise<string> {
    const r = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name)
       VALUES ($1, 'particulier', 'Test', 'Client') RETURNING id`,
      [organizationId],
    );
    return r.rows[0]!.id;
  }

  async function sale(customerId: string, storeId: string, validatedAt: string): Promise<void> {
    await query(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
         validated_at, total_ttc, total_ht, total_tva, receipt_number)
       VALUES ($1, $2, $3, $4, $5, 'validated', $6, 10, 10, 0, $7)`,
      [organizationId, storeId, registerId, userId, customerId, validatedAt, `T-${randomUUID().slice(0, 8)}`],
    );
  }

  function getReq(id: string) {
    return customerGet(new Request(`https://x.test/api/customers/${id}`), { params: { id } });
  }

  it("renvoie les deux boutiques, triées par nom, pour un client ayant acheté dans les deux", async () => {
    const id = await newCustomer();
    await sale(id, storeAId, '2026-01-10T10:00:00Z');
    await sale(id, storeBId, '2026-01-11T10:00:00Z');
    const res = await getReq(id);
    const body = await res.json() as { stores: { id: string; name: string }[] };
    expect(body.stores).toEqual([
      { id: storeAId, name: 'Fanny Fleurs' },
      { id: storeBId, name: 'Plante Verte' },
    ]);
  });

  it("un client sans aucun achat validé renvoie une liste vide (aucune boutique inventée)", async () => {
    const id = await newCustomer();
    const res = await getReq(id);
    const body = await res.json() as { stores: unknown[] };
    expect(body.stores).toEqual([]);
  });

  it("une vente non validée (brouillon) n'est pas comptée comme un achat dans une boutique", async () => {
    const id = await newCustomer();
    await query(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status, total_ttc, total_ht, total_tva)
       VALUES ($1, $2, $3, $4, $5, 'draft', 10, 10, 0)`,
      [organizationId, storeAId, registerId, userId, id],
    );
    const res = await getReq(id);
    const body = await res.json() as { stores: unknown[] };
    expect(body.stores).toEqual([]);
  });

  it("ne manque jamais une boutique plus ancienne même avec plus de 50 ventes au total (pas de LIMIT, contrairement à la liste des tickets)", async () => {
    const id = await newCustomer();
    // Achat ancien dans la boutique B.
    await sale(id, storeBId, '2020-01-01T10:00:00Z');
    // 55 achats plus récents, tous dans la boutique A.
    for (let i = 0; i < 55; i++) {
      await sale(id, storeAId, `2026-02-${String((i % 27) + 1).padStart(2, '0')}T10:00:00Z`);
    }
    const res = await getReq(id);
    const body = await res.json() as { stores: { id: string; name: string }[] };
    expect(body.stores.map((s) => s.name)).toEqual(['Fanny Fleurs', 'Plante Verte']);
  });
});
