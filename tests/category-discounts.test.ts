// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Remise automatique par catégorie, PAR BOUTIQUE (page Catégories) :
 * category_discounts (migration 0102), une ligne par (catégorie, boutique).
 * Soit « toujours active » (sans bornes de date), soit active seulement
 * entre start_date et end_date inclus. Résolue côté serveur (date du jour en
 * fuseau Europe/Paris) et renvoyée par /api/products pour la boutique
 * demandée, afin que la caisse l'applique automatiquement (CashRegister.tsx).
 *
 * Intégration contre une VRAIE base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: getDiscounts, PUT: putDiscounts } = await import('@/app/api/categories/[id]/discounts/route');
const { GET: getProducts } = await import('@/app/api/products/route');

function todayParis(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
}
function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

describe('Remise automatique par catégorie, par boutique', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let categoryId: string;
  let taxRateId: string;
  let productId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Category Discounts ${randomUUID()}`],
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
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `catdisc-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Bouquets') RETURNING id`,
      [organizationId],
    );
    categoryId = cat.rows[0]!.id;
    const tax = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, label, rate, code) VALUES ($1, 'TVA 20%', 20, 'STD') RETURNING id`,
      [organizationId],
    );
    taxRateId = tax.rows[0]!.id;
    // store_ids explicite : l'organisation a 2 boutiques, le filtrage caisse
    // est alors strict (voir /api/products) et un article sans rattachement
    // n'apparaîtrait dans AUCUNE des deux.
    const prod = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, category_id, tax_rate_id, sale_price_ttc, unit, store_ids)
       VALUES ($1, 'Bouquet rond', $2, $3, 50, 'unité', $4) RETURNING id`,
      [organizationId, categoryId, taxRateId, [storeAId, storeBId]],
    );
    productId = prod.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  function req(url: string, init?: RequestInit): Request {
    return new Request(url, init);
  }
  function putReq(body: unknown): Request {
    return req('https://x.test', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  it('aucune remise configurée au départ', async () => {
    const res = await getDiscounts(req('https://x.test'), { params: { id: categoryId } });
    const body = await res.json() as { discounts: unknown[] };
    expect(body.discounts).toEqual([]);
  });

  it('enregistre une remise « toujours active » (%) pour la boutique A', async () => {
    const res = await putDiscounts(putReq({
      discounts: [{ store_id: storeAId, discount_type: 'percent', discount_value: 10, always_active: true }],
    }), { params: { id: categoryId } });
    expect(res.status).toBe(200);

    const get = await getDiscounts(req('https://x.test'), { params: { id: categoryId } });
    const body = await get.json() as { discounts: Array<Record<string, unknown>> };
    expect(body.discounts).toEqual([{
      store_id: storeAId, discount_type: 'percent', discount_value: 10,
      always_active: true, start_date: null, end_date: null,
    }]);
  });

  it('refuse une remise avec always_active=false sans les deux dates', async () => {
    const res = await putDiscounts(putReq({
      discounts: [{ store_id: storeAId, discount_type: 'percent', discount_value: 10, always_active: false }],
    }), { params: { id: categoryId } });
    expect(res.status).toBe(422);
  });

  it('refuse un pourcentage supérieur à 100', async () => {
    const res = await putDiscounts(putReq({
      discounts: [{ store_id: storeAId, discount_type: 'percent', discount_value: 150, always_active: true }],
    }), { params: { id: categoryId } });
    expect(res.status).toBe(422);
  });

  it('refuse une boutique qui n\'appartient pas à l\'organisation', async () => {
    const res = await putDiscounts(putReq({
      discounts: [{ store_id: randomUUID(), discount_type: 'percent', discount_value: 10, always_active: true }],
    }), { params: { id: categoryId } });
    expect(res.status).toBe(404);
  });

  it('remplace l\'ensemble : une boutique omise voit sa remise supprimée, une nouvelle boutique (B, montant fixe, dates) est ajoutée', async () => {
    const today = todayParis();
    const res = await putDiscounts(putReq({
      discounts: [{
        store_id: storeBId, discount_type: 'amount', discount_value: 5, always_active: false,
        start_date: addDays(today, -1), end_date: addDays(today, 1),
      }],
    }), { params: { id: categoryId } });
    expect(res.status).toBe(200);

    const get = await getDiscounts(req('https://x.test'), { params: { id: categoryId } });
    const body = await get.json() as { discounts: Array<Record<string, unknown>> };
    expect(body.discounts).toHaveLength(1);
    expect(body.discounts[0]).toMatchObject({ store_id: storeBId, discount_type: 'amount', discount_value: 5, always_active: false });
  });

  it('/api/products renvoie la remise de catégorie active aujourd\'hui pour la boutique B, et rien pour la boutique A (remise supprimée au test précédent)', async () => {
    const resB = await getProducts(req(`https://x.test?store_id=${storeBId}`));
    const bodyB = await resB.json() as { products: Array<{ id: string; category_discount_type: string | null; category_discount_value: number | null }> };
    const prodB = bodyB.products.find((p) => p.id === productId)!;
    expect(prodB.category_discount_type).toBe('amount');
    expect(Number(prodB.category_discount_value)).toBe(5);

    const resA = await getProducts(req(`https://x.test?store_id=${storeAId}`));
    const bodyA = await resA.json() as { products: Array<{ id: string; category_discount_type: string | null; category_discount_value: number | null }> };
    const prodA = bodyA.products.find((p) => p.id === productId)!;
    expect(prodA.category_discount_type).toBeNull();
    expect(prodA.category_discount_value).toBeNull();
  });

  it('une remise programmée HORS de sa période (passée) ne ressort pas de /api/products', async () => {
    const today = todayParis();
    await putDiscounts(putReq({
      discounts: [{
        store_id: storeBId, discount_type: 'amount', discount_value: 5, always_active: false,
        start_date: addDays(today, -10), end_date: addDays(today, -2),
      }],
    }), { params: { id: categoryId } });

    const res = await getProducts(req(`https://x.test?store_id=${storeBId}`));
    const body = await res.json() as { products: Array<{ id: string; category_discount_type: string | null; category_discount_value: number | null }> };
    const prod = body.products.find((p) => p.id === productId)!;
    expect(prod.category_discount_type).toBeNull();
    expect(prod.category_discount_value).toBeNull();
  });

  it('sans store_id, /api/products ne renvoie aucune remise de catégorie (pas de boutique à résoudre)', async () => {
    const res = await getProducts(req('https://x.test'));
    const body = await res.json() as { products: Array<{ id: string; category_discount_type: string | null }> };
    const prod = body.products.find((p) => p.id === productId)!;
    expect(prod.category_discount_type).toBeNull();
  });
});
