// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Déstockage (PDA) : une série de sorties de stock (casse, péremption,
 * perte…) scannée à la chaîne, validée en une transaction, sous un code
 * unique par série (ex. D-2026-000001) à noter sur le contenant jeté.
 *
 * Intégration contre une VRAIE base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: destock } = await import('@/app/api/stock/destockage/route');

describe('Déstockage (PDA)', () => {
  let organizationId: string;
  let storeId: string;
  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Déstockage ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `dst-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const tax = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE) RETURNING id`,
      [organizationId],
    );
    const taxRateId = tax.rows[0]!.id;
    const productA = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, sale_price_ttc, tax_rate_id, barcode)
       VALUES ($1, 'Bouquet A', 10, $2, '1111111111111') RETURNING id`,
      [organizationId, taxRateId],
    );
    productAId = productA.rows[0]!.id;
    const productB = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, sale_price_ttc, tax_rate_id, barcode)
       VALUES ($1, 'Bouquet B', 15, $2, '2222222222222') RETURNING id`,
      [organizationId, taxRateId],
    );
    productBId = productB.rows[0]!.id;
    await query(
      `INSERT INTO stock_levels (organization_id, store_id, product_id, quantity) VALUES ($1,$2,$3,10)`,
      [organizationId, storeId, productAId],
    );
    await query(
      `INSERT INTO stock_levels (organization_id, store_id, product_id, quantity) VALUES ($1,$2,$3,5)`,
      [organizationId, storeId, productBId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  function req(body: Record<string, unknown>) {
    return destock(new Request('https://x.test/api/stock/destockage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  }

  it('décrémente le stock de chaque article et renvoie un code de série unique', async () => {
    const res = await req({
      store_id: storeId, reason: 'Casse',
      items: [{ product_id: productAId, quantity: 3 }, { product_id: productBId, quantity: 2 }],
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.reference).toMatch(/^D-\d{4}-\d{6}$/);
    expect(body.item_count).toBe(2);
    expect(body.total_quantity).toBe(5);

    const levels = await query<{ product_id: string; quantity: string }>(
      `SELECT product_id, quantity FROM stock_levels WHERE store_id = $1 ORDER BY product_id`,
      [storeId],
    );
    const byProduct = new Map(levels.rows.map((r) => [r.product_id, Number(r.quantity)]));
    expect(byProduct.get(productAId)).toBe(7);
    expect(byProduct.get(productBId)).toBe(3);
  });

  it('écrit un mouvement de stock par article, en perte (loss), rattaché à la série', async () => {
    const res = await req({
      store_id: storeId, reason: 'Produit périmé',
      items: [{ product_id: productAId, quantity: 1 }],
    });
    const body = await res.json();
    const batch = await query<{ reference: string; reason: string; item_count: number }>(
      `SELECT reference, reason, item_count FROM destockage_batches WHERE id = $1`,
      [body.id],
    );
    expect(batch.rows[0]?.reference).toBe(body.reference);
    expect(batch.rows[0]?.reason).toBe('Produit périmé');

    const movements = await query<{ movement_type: string; quantity_delta: string; source_type: string; source_id: string; reason: string }>(
      `SELECT movement_type, quantity_delta, source_type, source_id, reason FROM stock_movements
        WHERE source_type = 'destockage' AND source_id = $1`,
      [body.id],
    );
    expect(movements.rows.length).toBe(1);
    expect(movements.rows[0]?.movement_type).toBe('loss');
    expect(Number(movements.rows[0]?.quantity_delta)).toBe(-1);
    expect(movements.rows[0]?.reason).toBe('Produit périmé');
  });

  it('deux séries de la même organisation reçoivent des codes distincts, strictement croissants', async () => {
    const r1 = await req({ store_id: storeId, reason: 'Casse', items: [{ product_id: productAId, quantity: 1 }] });
    const r2 = await req({ store_id: storeId, reason: 'Casse', items: [{ product_id: productAId, quantity: 1 }] });
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.reference).not.toBe(b2.reference);
    const n1 = Number(b1.reference.split('-')[2]);
    const n2 = Number(b2.reference.split('-')[2]);
    expect(n2).toBe(n1 + 1);
  });

  it('rejette une quantité négative ou nulle (VALIDATION_ERROR)', async () => {
    const res = await req({ store_id: storeId, reason: 'Casse', items: [{ product_id: productAId, quantity: 0 }] });
    expect(res.status).toBe(422);
  });

  it('rejette un motif vide (VALIDATION_ERROR)', async () => {
    const res = await req({ store_id: storeId, reason: '', items: [{ product_id: productAId, quantity: 1 }] });
    expect(res.status).toBe(422);
  });

  it('accepte de passer en stock négatif, comme les autres mouvements manuels (aucun plancher)', async () => {
    const res = await req({ store_id: storeId, reason: 'Vol / disparition', items: [{ product_id: productBId, quantity: 999 }] });
    expect(res.status).toBe(201);
    const level = await query<{ quantity: string }>(
      `SELECT quantity FROM stock_levels WHERE store_id = $1 AND product_id = $2`,
      [storeId, productBId],
    );
    expect(Number(level.rows[0]?.quantity)).toBeLessThan(0);
  });
});
