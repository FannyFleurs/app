// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Bug remonté en production : un Pack créé via "+ Nouveau Pack" n'avait
 * AUCUNE catégorie (le formulaire de pack n'en propose pas, contrairement à
 * la fiche produit normale) — il tombait dans "Sans catégorie" sans moyen
 * direct de le corriger à la création.
 *
 * Corrigé en rattachant chaque pack, par défaut, à une catégorie "Pack" de
 * l'organisation (créée au besoin, une seule fois) — même principe que le
 * filet "Divers" de order-intake.ts. L'utilisateur reste libre de modifier
 * ensuite la catégorie du pack via la fiche produit normale, qui expose
 * déjà category_id.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: packsPost } = await import('@/app/api/products/packs/route');

describe.skipIf(!hasDb)('Création de pack — catégorie "Pack" par défaut', () => {
  let organizationId: string;
  let componentId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Pack Category ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `pc-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const tva = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE) RETURNING id`,
      [organizationId],
    );
    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Bouquets') RETURNING id`,
      [organizationId],
    );
    const comp = await query<{ id: string }>(
      `INSERT INTO products (organization_id, category_id, name, tax_rate_id, sale_price_ttc)
       VALUES ($1, $2, 'Rose', $3, 5) RETURNING id`,
      [organizationId, cat.rows[0]!.id, tva.rows[0]!.id],
    );
    componentId = comp.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function post(body: unknown) {
    return packsPost(new Request('https://x.test/api/products/packs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  }

  it('un nouveau pack est rattaché à une catégorie "Pack" créée au besoin, pas laissé sans catégorie', async () => {
    const res = await post({
      name: 'Pack Saint-Valentin',
      items: [{ product_id: componentId, quantity: 2 }],
    });
    expect(res.status).toBe(200);
    const { id } = await res.json() as { id: string };

    const row = await query<{ category_id: string | null; category_name: string | null }>(
      `SELECT p.category_id, c.name AS category_name
         FROM products p LEFT JOIN product_categories c ON c.id = p.category_id
        WHERE p.id = $1`,
      [id],
    );
    expect(row.rows[0]!.category_id).not.toBeNull();
    expect(row.rows[0]!.category_name).toBe('Pack');
  });

  it('un second pack réutilise LA MÊME catégorie "Pack" (pas de doublon)', async () => {
    const res = await post({
      name: 'Pack Anniversaire',
      items: [{ product_id: componentId, quantity: 1 }],
    });
    expect(res.status).toBe(200);
    const { id } = await res.json() as { id: string };

    const row = await query<{ category_id: string }>(`SELECT category_id FROM products WHERE id = $1`, [id]);

    const packCats = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM product_categories
        WHERE organization_id = $1 AND LOWER(TRIM(name)) = 'pack'`,
      [organizationId],
    );
    expect(packCats.rows[0]!.count).toBe('1');

    const firstPackCat = await query<{ id: string }>(
      `SELECT id FROM product_categories WHERE organization_id = $1 AND LOWER(TRIM(name)) = 'pack'`,
      [organizationId],
    );
    expect(row.rows[0]!.category_id).toBe(firstPackCat.rows[0]!.id);
  });

  it('une organisation ayant déjà une catégorie "pack" (casse différente) la réutilise sans en recréer une', async () => {
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Pack Category Existing ${randomUUID()}`],
    );
    const org2Id = org2.rows[0]!.id;
    const user2 = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [org2Id, `pc2-${randomUUID()}@example.test`],
    );
    const tva2 = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE) RETURNING id`,
      [org2Id],
    );
    const cat2 = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Bouquets') RETURNING id`,
      [org2Id],
    );
    const comp2 = await query<{ id: string }>(
      `INSERT INTO products (organization_id, category_id, name, tax_rate_id, sale_price_ttc)
       VALUES ($1, $2, 'Tulipe', $3, 3) RETURNING id`,
      [org2Id, cat2.rows[0]!.id, tva2.rows[0]!.id],
    );
    const existingPackCat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, '  pack  ') RETURNING id`,
      [org2Id],
    );

    currentUser = { id: user2.rows[0]!.id, organizationId: org2Id, email: 'x', fullName: 'Testeur', role: 'owner' };
    const res = await post({ name: 'Pack Fête des mères', items: [{ product_id: comp2.rows[0]!.id, quantity: 1 }] });
    expect(res.status).toBe(200);
    const { id } = await res.json() as { id: string };

    const row = await query<{ category_id: string }>(`SELECT category_id FROM products WHERE id = $1`, [id]);
    expect(row.rows[0]!.category_id).toBe(existingPackCat.rows[0]!.id);

    const packCats = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM product_categories
        WHERE organization_id = $1 AND LOWER(TRIM(name)) = 'pack'`,
      [org2Id],
    );
    expect(packCats.rows[0]!.count).toBe('1');
  });
});
