import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { createIncomingOrder } from '@/lib/services/order-intake';

/**
 * Remise systématique "OGF Services Financiers" (fiche client,
 * customers.default_discount_pct) non appliquée aux lignes des commandes
 * OGF : order-intake.ts attribuait déjà le client (customer_id) mais
 * codait discountAmount: 0 en dur, sans jamais lire sa remise. Corrigé en
 * appliquant la même formule que CashRegister.tsx/pickCustomer
 * (discount = round2(unit_price_ttc * quantity * pct / 100)) à chaque
 * ligne, et en taguant metadata.auto_discount_pct pour que les rapports de
 * remises (app/api/reports/discounts, app/api/ca/discounts) la comptent
 * comme une remise AUTOMATIQUE client, pas manuelle.
 *
 * Intégration contre une VRAIE base Postgres (comme les autres suites
 * d'intégration *-stripe- et *-scoping).
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('order-intake — remise systématique client (OGF Services Financiers)', () => {
  let organizationId: string;
  let storeId: string;
  let customerId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test OGF Discount ${randomUUID()}`],
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
      [organizationId, `oid-${randomUUID()}@example.test`],
    );
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );

    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, company_name, default_discount_pct)
       VALUES ($1, 'professionnel', 'OGF Services Financiers', 20) RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function fetchLines(saleId: string) {
    const r = await query<{
      unit_price_ttc: string; quantity: string; discount_amount: string;
      line_ttc: string; metadata: { auto_discount_pct?: number };
    }>(
      `SELECT unit_price_ttc, quantity, discount_amount, line_ttc, metadata
         FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`,
      [saleId],
    );
    return r.rows;
  }

  it('une commande OGF applique la remise de -20% de la fiche client à chaque ligne', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'OGF', subtype: 'ogf',
      lines: [
        { label: 'Composition', amount_ttc: 50 },
        { label: 'Ruban deuil', amount_ttc: 15 },
      ],
    });

    const sale = await query<{ customer_id: string }>(
      `SELECT customer_id FROM sales WHERE id = $1`, [res.id],
    );
    expect(sale.rows[0]!.customer_id).toBe(customerId);

    const lines = await fetchLines(res.id);
    // 50 * 1 * 20% = 10, 15 * 1 * 20% = 3.
    expect(Number(lines[0]!.discount_amount)).toBe(10);
    expect(Number(lines[0]!.line_ttc)).toBe(40);
    expect(lines[0]!.metadata.auto_discount_pct).toBe(20);

    expect(Number(lines[1]!.discount_amount)).toBe(3);
    expect(Number(lines[1]!.line_ttc)).toBe(12);
    expect(lines[1]!.metadata.auto_discount_pct).toBe(20);
  });

  it('la remise tient compte de la quantité de la ligne', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'OGF', subtype: 'ogf',
      lines: [{ label: 'Ruban deuil', amount_ttc: 15, quantity: 2 }],
    });
    const lines = await fetchLines(res.id);
    // 15 * 2 * 20% = 6.
    expect(Number(lines[0]!.discount_amount)).toBe(6);
    expect(Number(lines[0]!.line_ttc)).toBe(24);
  });

  it('une commande WEB (pas OGF) ne bénéficie d\'aucune remise automatique', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [{ label: 'Bouquet rond', amount_ttc: 35 }],
    });
    const sale = await query<{ customer_id: string | null }>(
      `SELECT customer_id FROM sales WHERE id = $1`, [res.id],
    );
    expect(sale.rows[0]!.customer_id).toBeNull();

    const lines = await fetchLines(res.id);
    expect(Number(lines[0]!.discount_amount)).toBe(0);
    expect(lines[0]!.metadata.auto_discount_pct).toBeUndefined();
  });

  it('sans fiche "OGF Services Financiers" dans l\'organisation, une commande OGF n\'applique aucune remise (pas de crash)', async () => {
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test OGF Discount Sans Fiche ${randomUUID()}`],
    );
    const org2Id = org2.rows[0]!.id;
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org2Id],
    );
    await query(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse')`,
      [org2Id, store2.rows[0]!.id],
    );
    await query(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner')`,
      [org2Id, `oid2-${randomUUID()}@example.test`],
    );
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [org2Id],
    );

    const res = await createIncomingOrder({
      organizationId: org2Id, storeId: store2.rows[0]!.id, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'OGF', subtype: 'ogf',
      lines: [{ label: 'Composition', amount_ttc: 50 }],
    });
    const lines = await fetchLines(res.id);
    expect(Number(lines[0]!.discount_amount)).toBe(0);
  });
});
