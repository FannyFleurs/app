// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * /api/accounting/coverage ne doit pas lister un croisement qui retombe à
 * 0 € HT (ex. un article offert à 0 €) dans « Croisements vendus sans
 * compte » : aucune écriture réelle n'en découle, le signaler comme « à
 * paramétrer » n'aide personne — ça ne fait que semer la confusion sur une
 * vente qui, de fait, n'a rien rapporté (voir aussi lib/services/
 * accounting-mapping.ts pour le même filtre côté export).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));

const { GET: coverage } = await import('@/app/api/accounting/coverage/route');

describe.skipIf(!hasDb)('Coverage comptable — un croisement à 0 € HT est omis', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  const today = new Date().toISOString().slice(0, 10);

  async function insertSale(categoryId: string, productId: string | null, label: string, amountHt: number): Promise<void> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, validated_at, total_ttc)
       VALUES ($1, $2, $3, $4, 'validated', now(), $5) RETURNING id`,
      [organizationId, storeId, registerId, userId, amountHt * 1.1],
    );
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, product_id, category_id, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, $3, $4, $5, $6, 1, 10, 'TVA10', $7, $7 * 0.1, $7 * 1.1)`,
      [organizationId, sale.rows[0]!.id, label, productId, productId ? null : categoryId, amountHt * 1.1, amountHt],
    );
  }

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Coverage Zero Amount ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Plante Verte') RETURNING id`,
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
      [organizationId, `cov-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const tva10 = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA10', '10%', 10, TRUE) RETURNING id`,
      [organizationId],
    );
    const taxRateId = tva10.rows[0]!.id;

    const accessoire = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Accessoire') RETURNING id`,
      [organizationId],
    );
    const accessoireId = accessoire.rows[0]!.id;
    const plantes = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Plantes vertes') RETURNING id`,
      [organizationId],
    );
    const plantesId = plantes.rows[0]!.id;

    const sacKraft = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, category_id, tax_rate_id, sale_price_ttc)
       VALUES ($1, 'Sac Kraft Offert', $2, $3, 0) RETURNING id`,
      [organizationId, accessoireId, taxRateId],
    );
    const bouquet = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, category_id, tax_rate_id, sale_price_ttc)
       VALUES ($1, 'Bouquet rond', $2, $3, 22) RETURNING id`,
      [organizationId, plantesId, taxRateId],
    );

    // Le sac offert : vendu à 0 € HT, systématiquement avec un bouquet payant.
    await insertSale(accessoireId, sacKraft.rows[0]!.id, 'Sac Kraft Offert', 0);
    await insertSale(plantesId, bouquet.rows[0]!.id, 'Bouquet rond', 20);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('ne liste pas le croisement "Accessoire" à 0 € HT, mais liste "Plantes vertes"', async () => {
    const url = `https://x.test/api/accounting/coverage?from=${today}&to=${today}`;
    const res = await coverage(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json() as { crossings: { category_name: string | null; ht: number }[] };
    const familles = body.crossings.map((c) => c.category_name);
    expect(familles).not.toContain('Accessoire');
    expect(familles).toContain('Plantes vertes');
  });
});
