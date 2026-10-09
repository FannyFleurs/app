// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Bouton "forcer la mise à jour des prix sur les caisses" — option retenue
 * avec l'utilisateur (2026-10-09) : pas de bouton, mais une vérification
 * automatique côté caisse (CashRegister.tsx), légère (juste un horodatage),
 * toutes les 15s + au retour sur l'onglet. Ce fichier teste le point d'API
 * qui porte cette vérification : /api/products/catalog-version doit refléter
 * tout changement de prix (ou de catégorie/variante), et RIEN d'autre (pas de
 * faux positif sur un autre type de donnée).
 *
 * Intégration contre une VRAIE base Postgres (le trigger "touch" qui met à
 * jour `updated_at` automatiquement n'est pas simulable par un mock).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: catalogVersion } = await import('@/app/api/products/catalog-version/route');

describe.skipIf(!hasDb)('GET /api/products/catalog-version', () => {
  let organizationId: string;
  let categoryId: string;
  let taxRateId: string;
  let productId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Catalog Version ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `cv-${randomUUID()}@example.test`],
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
    const prod = await query<{ id: string }>(
      `INSERT INTO products (organization_id, category_id, name, tax_rate_id, sale_price_ttc)
       VALUES ($1, $2, 'Bouquet', $3, 25.00) RETURNING id`,
      [organizationId, categoryId, taxRateId],
    );
    productId = prod.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function version(): Promise<string | null> {
    const res = await catalogVersion();
    const body = await res.json() as { version: string | null };
    return body.version;
  }

  it('renvoie un horodatage non nul une fois un produit créé', async () => {
    const v = await version();
    expect(v).not.toBeNull();
  });

  it('change quand le prix d\'un produit est modifié (déclenche la réactualisation caisse)', async () => {
    const before = await version();
    await new Promise((r) => setTimeout(r, 10));
    await query(`UPDATE products SET sale_price_ttc = 30.00 WHERE id = $1`, [productId]);
    const after = await version();
    expect(after).not.toBe(before);
  });

  it('change aussi quand une variante change de prix', async () => {
    const variant = await query<{ id: string }>(
      `INSERT INTO product_variants (organization_id, product_id, label, sale_price_ttc)
       VALUES ($1, $2, 'Taille M', 20.00) RETURNING id`,
      [organizationId, productId],
    );
    const before = await version();
    await new Promise((r) => setTimeout(r, 10));
    await query(`UPDATE product_variants SET sale_price_ttc = 22.00 WHERE id = $1`, [variant.rows[0]!.id]);
    const after = await version();
    expect(after).not.toBe(before);
  });

  it('change aussi quand une catégorie est modifiée (taux de TVA par défaut)', async () => {
    const before = await version();
    await new Promise((r) => setTimeout(r, 10));
    await query(`UPDATE product_categories SET name = 'Fleurs coupées' WHERE id = $1`, [categoryId]);
    const after = await version();
    expect(after).not.toBe(before);
  });

  it('une organisation sans aucun produit renvoie null (pas d\'erreur)', async () => {
    const originalUser = currentUser;
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Catalog Version Empty ${randomUUID()}`],
    );
    const user2 = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [org2.rows[0]!.id, `cv2-${randomUUID()}@example.test`],
    );
    currentUser = { id: user2.rows[0]!.id, organizationId: org2.rows[0]!.id, email: 'x', fullName: 'Testeur', role: 'owner' };
    expect(await version()).toBeNull();
    currentUser = originalUser;
  });
});
