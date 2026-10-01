import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { createIncomingOrder } from '@/lib/services/order-intake';

/**
 * Catégorie des lignes de commande entrante (web / OGF) : ces lignes sont en
 * prix libre, sans produit rattaché (voir order-intake.ts), donc la
 * catégorie ne peut pas venir d'un product_id — elle est résolue par NOM
 * (celui envoyé par la source) contre les catégories existantes de
 * l'organisation, insensible à la casse/aux espaces. Sans correspondance (ou
 * sans nom fourni), elle retombe sur "Divers" (créée au besoin), pour que les
 * exports qui ventilent par famille restent complets. Intégration contre une
 * VRAIE base Postgres (comme les autres suites d'intégration *-stripe- et
 * *-scoping).
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('order-intake — catégorie des lignes web/OGF', () => {
  let organizationId: string;
  let storeId: string;
  let fleursCategoryId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Order Intake Category ${randomUUID()}`],
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
      [organizationId, `oic-${randomUUID()}@example.test`],
    );
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );

    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Fleurs coupées') RETURNING id`,
      [organizationId],
    );
    fleursCategoryId = cat.rows[0]!.id;
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

  it('une ligne dont la catégorie correspond exactement (casse/espaces près) est rattachée à cette catégorie', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [{ label: 'Bouquet rond', amount_ttc: 35, category: '  FLEURS COUPées  ' }],
    });
    const ids = await lineCategoryIds(res.id);
    expect(ids).toEqual([fleursCategoryId]);
  });

  it('une ligne sans correspondance (nom inconnu) retombe sur "Divers", créée automatiquement', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [{ label: 'Mystère', amount_ttc: 12, category: 'Catégorie inconnue du site' }],
    });
    const ids = await lineCategoryIds(res.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBeNull();
    expect(ids[0]).not.toBe(fleursCategoryId);

    const cat = await query<{ name: string }>(
      `SELECT name FROM product_categories WHERE id = $1`, [ids[0]],
    );
    expect(cat.rows[0]!.name).toBe('Divers');
  });

  it('une ligne sans nom de catégorie du tout retombe aussi sur "Divers" (réutilise la même, pas de doublon)', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'OGF',
      lines: [{ label: 'Sans catégorie', amount_ttc: 20 }],
    });
    const ids = await lineCategoryIds(res.id);

    const diversRows = await query<{ id: string }>(
      `SELECT id FROM product_categories WHERE organization_id = $1 AND name = 'Divers'`,
      [organizationId],
    );
    expect(diversRows.rows).toHaveLength(1);
    expect(ids[0]).toBe(diversRows.rows[0]!.id);
  });

  it('plusieurs lignes de la même commande peuvent avoir des catégories différentes', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [
        { label: 'Bouquet rond', amount_ttc: 35, category: 'Fleurs coupées' },
        { label: 'Carte message', amount_ttc: 2 },
      ],
    });
    const ids = await lineCategoryIds(res.id);
    expect(ids[0]).toBe(fleursCategoryId);
    expect(ids[1]).not.toBe(fleursCategoryId);
    expect(ids[1]).not.toBeNull();
  });

  it('une fois la vente validée, les exports (COALESCE produit/ligne) retrouvent la catégorie de la ligne', async () => {
    const res = await createIncomingOrder({
      organizationId, storeId, externalRef: `ref-${randomUUID()}`,
      boutiqueLabel: 'Fanny Fleurs', source: 'WEB',
      lines: [{ label: 'Bouquet rond', amount_ttc: 35, category: 'Fleurs coupées' }],
    });
    await query(
      `UPDATE sales SET status = 'validated', validated_at = now() WHERE id = $1`,
      [res.id],
    );
    // Même forme que app/api/exports/accounting, /accounting/coverage,
    // /ca/products et /reports/sale-lines : une ligne sans produit retrouve
    // sa catégorie via sl.category_id.
    const r = await query<{ category_name: string | null }>(
      `SELECT c.name AS category_name
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
         LEFT JOIN products p ON p.id = sl.product_id
         LEFT JOIN product_categories c ON c.id = COALESCE(p.category_id, sl.category_id)
        WHERE s.id = $1`,
      [res.id],
    );
    expect(r.rows[0]!.category_name).toBe('Fleurs coupées');
  });
});
