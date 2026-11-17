// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Rapports « Par catégorie » et « Par fournisseur » (Rapports du back-office) :
 * chiffre d'affaires, marge et classement, avec filtre boutique.
 *
 * Intégration contre une VRAIE base Postgres, même conventions que
 * tests/gift-card-ca-exclusion.test.ts.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));

const { GET: byCategoryGet } = await import('@/app/api/reports/by-category/route');
const { GET: bySupplierGet } = await import('@/app/api/reports/by-supplier/route');

describe.skipIf(!hasDb)('Rapports Par catégorie / Par fournisseur', () => {
  let organizationId: string;
  let store1Id: string;
  let store2Id: string;
  let registerId: string;
  let register2Id: string;
  let userId: string;
  const DAY = '2026-10-10';

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Reports Category Supplier ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store1 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'S1', 'Boutique 1') RETURNING id`,
      [organizationId],
    );
    store1Id = store1.rows[0]!.id;
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'S2', 'Boutique 2') RETURNING id`,
      [organizationId],
    );
    store2Id = store2.rows[0]!.id;

    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse 1') RETURNING id`,
      [organizationId, store1Id],
    );
    registerId = register.rows[0]!.id;
    const register2 = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R2', 'Caisse 2') RETURNING id`,
      [organizationId, store2Id],
    );
    register2Id = register2.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `rbcs-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const taxRate = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate) VALUES ($1, 'STD', '20%', 20) RETURNING id`,
      [organizationId],
    );
    const taxRateId = taxRate.rows[0]!.id;

    const catA = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Bouquets') RETURNING id`,
      [organizationId],
    );
    const catB = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Plantes') RETURNING id`,
      [organizationId],
    );

    const supA = await query<{ id: string }>(
      `INSERT INTO suppliers (organization_id, name) VALUES ($1, 'Grossiste A') RETURNING id`,
      [organizationId],
    );
    const supB = await query<{ id: string }>(
      `INSERT INTO suppliers (organization_id, name) VALUES ($1, 'Grossiste B') RETURNING id`,
      [organizationId],
    );

    async function product(categoryId: string | null, supplierId: string | null, purchasePriceHt: number | null, name: string): Promise<string> {
      const r = await query<{ id: string }>(
        `INSERT INTO products (organization_id, category_id, supplier_id, name, unit, tax_rate_id, sale_price_ttc, purchase_price_ht)
         VALUES ($1, $2, $3, $4, 'unité', $5, 10, $6) RETURNING id`,
        [organizationId, categoryId, supplierId, name, taxRateId, purchasePriceHt],
      );
      return r.rows[0]!.id;
    }
    const p1 = await product(catA.rows[0]!.id, supA.rows[0]!.id, 10, 'Bouquet rose'); // catA, supA, coûté
    const p2 = await product(catB.rows[0]!.id, supA.rows[0]!.id, null, 'Plante verte'); // catB, supA, SANS coût connu
    const p3 = await product(catA.rows[0]!.id, supB.rows[0]!.id, 5, 'Bouquet blanc'); // catA, supB, coûté
    const p4 = await product(null, null, 2, 'Divers'); // ni catégorie ni fournisseur

    async function sale(storeId: string, registerIdArg: string, receipt: string): Promise<string> {
      const s = await query<{ id: string }>(
        `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
           validated_at, total_ttc, total_ht, total_tva, receipt_number)
         VALUES ($1, $2, $3, $4, 'validated', $5, 0, 0, 0, $6) RETURNING id`,
        [organizationId, storeId, registerIdArg, userId, `${DAY}T10:00:00Z`, receipt],
      );
      return s.rows[0]!.id;
    }
    async function line(saleId: string, idx: number, productId: string | null, qty: number, ht: number, tva: number, ttc: number, discount = 0): Promise<void> {
      await query(
        `INSERT INTO sale_lines
           (organization_id, sale_id, line_index, product_id, label, unit_price_ttc, quantity,
            discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
         VALUES ($1, $2, $3, $4, 'Ligne', $5, $6, $7, 20, 'STD', $8, $9, $10)`,
        [organizationId, saleId, idx, productId, ttc / qty, qty, discount, ht, tva, ttc],
      );
    }

    const saleStore1 = await sale(store1Id, registerId, 'R-0001');
    await line(saleStore1, 0, p1, 1, 100, 20, 120, 5); // catA / supA, coûté (10)
    await line(saleStore1, 1, p2, 1, 50, 10, 60); // catB / supA, SANS coût
    await line(saleStore1, 2, p3, 2, 40, 8, 48); // catA / supB, coûté (5 x 2 = 10)
    await line(saleStore1, 3, p4, 1, 20, 4, 24); // Sans catégorie / Sans fournisseur, coûté (2)
    // Carte cadeau vendue : encaissement différé, jamais du CA — doit être
    // totalement absente de tous les regroupements (voir lib/analytics/gift-card-ca.ts).
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, metadata)
       VALUES ($1, $2, 4, 'Carte cadeau', 50, 1, 0, 'CADEAU', 50, 0, 50, $3::jsonb)`,
      [organizationId, saleStore1, JSON.stringify({ gift_card: true, gift_card_ca_deferred: true })],
    );

    // Deuxième boutique : une vente du même produit p1, pour tester le filtre.
    const saleStore2 = await sale(store2Id, register2Id, 'R-0002');
    await line(saleStore2, 0, p1, 1, 100, 20, 120);
  });

  afterAll(async () => {
    await pool.end();
  });

  function req(path: string): Request {
    return new Request(`https://x.test${path}`);
  }

  describe('Par catégorie', () => {
    it("ventile par catégorie, classé par CA TTC décroissant, marge nulle sans coût connu", async () => {
      const res = await byCategoryGet(req(`/api/reports/by-category?from=${DAY}&to=${DAY}`));
      const body = await res.json() as { lines: Array<{ category: string; quantity: number; ht: number; ttc: number; discount: number; margin: number | null }>; totals: { ttc: number; margin: number } };

      expect(body.lines.map((l) => l.category)).toEqual(['Bouquets', 'Plantes', 'Sans catégorie']);

      // Sans filtre boutique : p1 compte pour les DEUX ventes (boutique 1 ET
      // boutique 2, voir plus bas) — 100 € HT à chaque fois.
      const bouquets = body.lines.find((l) => l.category === 'Bouquets')!;
      expect(bouquets.ht).toBeCloseTo(240, 2); // p1 (100+100) + p3 (40)
      expect(bouquets.ttc).toBeCloseTo(288, 2);
      expect(bouquets.quantity).toBeCloseTo(4, 3); // 1 + 1 + 2
      expect(bouquets.discount).toBeCloseTo(5, 2);
      expect(bouquets.margin).toBeCloseTo(210, 2); // (100-10) + (100-10) + (40-10)

      const plantes = body.lines.find((l) => l.category === 'Plantes')!;
      expect(plantes.ht).toBeCloseTo(50, 2);
      expect(plantes.margin).toBeNull(); // p2 sans purchase_price_ht connu

      const sansCategorie = body.lines.find((l) => l.category === 'Sans catégorie')!;
      // p4 uniquement : la carte cadeau (sans produit, donc aussi sans
      // catégorie) ne doit JAMAIS gonfler ce total.
      expect(sansCategorie.ht).toBeCloseTo(20, 2);
      expect(sansCategorie.ttc).toBeCloseTo(24, 2);
      expect(sansCategorie.margin).toBeCloseTo(18, 2);

      expect(body.totals.ttc).toBeCloseTo(288 + 60 + 24, 2);
      expect(body.totals.margin).toBeCloseTo(210 + 18, 2); // Plantes exclue (marge nulle)
    });

    it("le filtre boutique exclut les ventes des autres boutiques", async () => {
      const res = await byCategoryGet(req(`/api/reports/by-category?from=${DAY}&to=${DAY}&store_id=${store2Id}`));
      const body = await res.json() as { lines: Array<{ category: string; ttc: number }> };
      expect(body.lines).toEqual([{
        category: 'Bouquets', quantity: 1, ht: 100, tva: 20, ttc: 120, discount: 0, margin: 90, marge_pct: 90,
      }]);
    });
  });

  describe('Par fournisseur', () => {
    it("ventile par fournisseur, classé par CA TTC décroissant", async () => {
      const res = await bySupplierGet(req(`/api/reports/by-supplier?from=${DAY}&to=${DAY}`));
      const body = await res.json() as { lines: Array<{ supplier: string; ht: number; ttc: number; margin: number | null }>; totals: { ttc: number } };

      expect(body.lines.map((l) => l.supplier)).toEqual(['Grossiste A', 'Grossiste B', 'Sans fournisseur']);

      // Sans filtre boutique : p1 (Grossiste A) compte pour les deux ventes.
      const grossisteA = body.lines.find((l) => l.supplier === 'Grossiste A')!;
      expect(grossisteA.ht).toBeCloseTo(250, 2); // p1 (100+100) + p2 (50)
      expect(grossisteA.margin).toBeCloseTo(230, 2); // p1 coûté deux fois : (100-10)*2 + p2 non coûté

      const grossisteB = body.lines.find((l) => l.supplier === 'Grossiste B')!;
      expect(grossisteB.ht).toBeCloseTo(40, 2);
      expect(grossisteB.margin).toBeCloseTo(30, 2); // 40 - (5*2)

      const sansFournisseur = body.lines.find((l) => l.supplier === 'Sans fournisseur')!;
      expect(sansFournisseur.ht).toBeCloseTo(20, 2);

      expect(body.totals.ttc).toBeCloseTo(300 + 48 + 24, 2);
    });

    it("le filtre boutique s'applique aussi au rapport fournisseur", async () => {
      const res = await bySupplierGet(req(`/api/reports/by-supplier?from=${DAY}&to=${DAY}&store_id=${store2Id}`));
      const body = await res.json() as { lines: Array<{ supplier: string }> };
      expect(body.lines.map((l) => l.supplier)).toEqual(['Grossiste A']);
    });
  });
});
