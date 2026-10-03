import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { createIncomingOrder } from '@/lib/services/order-intake';
import { SaleService, type SaleLineInput } from '@/lib/services/sale-service';

/**
 * Régression en production (2026-10-03) : une commande web/OGF arrivait
 * correctement catégorisée à l'intake (order-intake.ts), mais la catégorie
 * disparaissait dès que le ticket était rappelé puis resynchronisé par la
 * caisse — SaleService.setLines REMPLACE toutes les lignes de la vente à
 * chaque appel (DELETE puis réinsertion) et n'a jamais porté category_id,
 * donc la caisse l'effaçait en silence dès le premier rappel du ticket
 * (CashRegister.tsx : syncLines, 250 ms après tout changement de panier).
 *
 * La catégorie doit survivre au cycle complet :
 *   intake (resolveCategoryId) → rappel en caisse → resynchro (setLines).
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('SaleLineInput.category_id — survit à une resynchro setLines', () => {
  let organizationId: string;
  let storeId: string;
  let categoryId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Category Roundtrip ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;

    await query(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse')`,
      [organizationId, storeId],
    );
    await query(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner')`,
      [organizationId, `clr-${randomUUID()}@example.test`],
    );
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA10', '10%', 10, TRUE)`,
      [organizationId],
    );

    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Bouquets') RETURNING id`,
      [organizationId],
    );
    categoryId = cat.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function lineCategoryIds(saleId: string): Promise<(string | null)[]> {
    const r = await query<{ category_id: string | null }>(
      `SELECT category_id FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`,
      [saleId],
    );
    return r.rows.map((row) => row.category_id);
  }

  it('la catégorie résolue à l\'intake est bien en base avant tout rappel', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [{ label: 'Bouquet rond', amount_ttc: 35, category: 'Bouquets' }],
    });
    expect(await lineCategoryIds(res.id)).toEqual([categoryId]);
  });

  it('rappelée en caisse puis resynchronisée EN TRANSMETTANT category_id : la catégorie survit', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [{ label: 'Bouquet rond', amount_ttc: 35, category: 'Bouquets' }],
    });
    // Simule exactement ce que fait la caisse au rappel (GET /api/sales/[id]
    // renvoie category_id) puis à la resynchro (PUT .../lines, syncLines) :
    // la ligne récupérée est retransmise telle quelle à setLines.
    const fetched = await query<{
      product_id: string | null; variant_id: string | null; label: string;
      unit_price_ttc: string; quantity: string; discount_amount: string;
      tax_rate: string; tax_rate_code: string; metadata: unknown; category_id: string | null;
    }>(`SELECT * FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`, [res.id]);
    const roundtripLines: SaleLineInput[] = fetched.rows.map((l) => ({
      product_id: l.product_id, variant_id: l.variant_id, label: l.label,
      unit_price_ttc: Number(l.unit_price_ttc), quantity: Number(l.quantity),
      discount_amount: Number(l.discount_amount), tax_rate: Number(l.tax_rate),
      tax_rate_code: l.tax_rate_code, metadata: l.metadata as Record<string, unknown>,
      category_id: l.category_id,
    }));
    await SaleService.setLines(res.id, organizationId, roundtripLines);
    expect(await lineCategoryIds(res.id)).toEqual([categoryId]);
  });

  it('(régression) resynchroniser SANS transmettre category_id efface bien la catégorie — documente le bug corrigé', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [{ label: 'Bouquet rond', amount_ttc: 35, category: 'Bouquets' }],
    });
    expect(await lineCategoryIds(res.id)).toEqual([categoryId]);

    // Même appel, mais SANS category_id dans la ligne (l'ancien comportement
    // de CashRegister.tsx avant le correctif) : setLines REMPLACE la ligne
    // intégralement, category_id retombe donc à NULL.
    await SaleService.setLines(res.id, organizationId, [{
      product_id: null, variant_id: null, label: 'Bouquet rond',
      unit_price_ttc: 35, quantity: 1, discount_amount: 0,
      tax_rate: 10, tax_rate_code: 'TVA10', metadata: {},
    }]);
    expect(await lineCategoryIds(res.id)).toEqual([null]);
  });
});
