// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Catalogue caisse (pos=1) : stock_qty, utilisé par la bulle de stock sur la
 * tuile (réglage pos_ui.show_stock — Paramètres caisse → Affichage du
 * contenu). Null tant que track_stock est faux ou qu'aucune boutique n'est
 * précisée ; sinon la somme des quantités en stock pour CETTE boutique
 * uniquement (pas les autres boutiques de l'organisation).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));

const { GET: getProducts } = await import('@/app/api/products/route');

describe.skipIf(!hasDb)('Catalogue caisse — quantité en stock par tuile', () => {
  let organizationId: string;
  let categoryId: string;
  let taxRateId: string;
  let storeAId: string;
  let storeBId: string;
  let trackedId: string;
  let untrackedId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Stock Qty Tile ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `psq-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const tax = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE) RETURNING id`,
      [organizationId],
    );
    taxRateId = tax.rows[0]!.id;
    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Fleurs') RETURNING id`,
      [organizationId],
    );
    categoryId = cat.rows[0]!.id;
    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T1', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T2', 'Boutique B') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;

    // store_ids explicite sur les 2 boutiques : l'organisation en compte 2
    // actives, donc le filtrage strict de la caisse (pos=1) exclurait un
    // article sans rattachement explicite — hors sujet de ce test.
    const tracked = await query<{ id: string }>(
      `INSERT INTO products (organization_id, category_id, name, tax_rate_id, sale_price_ttc, track_stock, visible_in_pos, store_ids)
       VALUES ($1, $2, 'Bouquet suivi', $3, 25.00, TRUE, TRUE, $4) RETURNING id`,
      [organizationId, categoryId, taxRateId, [storeAId, storeBId]],
    );
    trackedId = tracked.rows[0]!.id;
    const untracked = await query<{ id: string }>(
      `INSERT INTO products (organization_id, category_id, name, tax_rate_id, sale_price_ttc, track_stock, visible_in_pos, store_ids)
       VALUES ($1, $2, 'Fleur non suivie', $3, 5.00, FALSE, TRUE, $4) RETURNING id`,
      [organizationId, categoryId, taxRateId, [storeAId, storeBId]],
    );
    untrackedId = untracked.rows[0]!.id;

    // Stock de l'article suivi réparti sur 2 lignes dans la boutique A (ex.
    // variantes) — doit être SOMMÉ — et un stock différent dans la boutique B.
    await query(
      `INSERT INTO stock_levels (organization_id, store_id, product_id, quantity) VALUES
         ($1, $2, $3, 4), ($1, $4, $3, 100)`,
      [organizationId, storeAId, trackedId, storeBId],
    );
    await query(
      `UPDATE stock_levels SET quantity = 3.5 WHERE store_id = $1 AND product_id = $2`,
      [storeAId, trackedId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('pos=1 avec store_id : renvoie le stock de LA boutique demandée, pas une autre', async () => {
    const res = await getProducts(new Request(`https://x.test/api/products?pos=1&store_id=${storeAId}`));
    expect(res.status).toBe(200);
    const { products } = await res.json() as { products: { id: string; stock_qty: number | null }[] };
    const tracked = products.find((p) => p.id === trackedId)!;
    expect(tracked.stock_qty).toBe(3.5);
  });

  it('une autre boutique de la même organisation a sa propre quantité', async () => {
    const res = await getProducts(new Request(`https://x.test/api/products?pos=1&store_id=${storeBId}`));
    const { products } = await res.json() as { products: { id: string; stock_qty: number | null }[] };
    const tracked = products.find((p) => p.id === trackedId)!;
    expect(tracked.stock_qty).toBe(100);
  });

  it('un article sans ligne de stock pour cette boutique renvoie null (pas 0)', async () => {
    const res = await getProducts(new Request(`https://x.test/api/products?pos=1&store_id=${storeAId}`));
    const { products } = await res.json() as { products: { id: string; stock_qty: number | null }[] };
    const untracked = products.find((p) => p.id === untrackedId)!;
    expect(untracked.stock_qty).toBeNull();
  });

  it('sans store_id (ex. back-office) : stock_qty est null, pas calculé', async () => {
    const res = await getProducts(new Request('https://x.test/api/products'));
    const { products } = await res.json() as { products: { id: string; stock_qty: number | null }[] };
    const tracked = products.find((p) => p.id === trackedId)!;
    expect(tracked.stock_qty).toBeNull();
  });
});
