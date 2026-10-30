// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { query, pool } from '@/lib/db/client';

/**
 * Colonne Fournisseur sur l'import produits : même comportement que la
 * colonne Catégorie déjà existante — correspondance par nom (insensible à
 * la casse, espaces ignorés) sur les fournisseurs déjà créés, sinon création
 * automatique à la validation. Le modèle Excel propose, pour les deux
 * colonnes, une liste déroulante suggestive (pas bloquante) des valeurs
 * déjà existantes dans l'organisation.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: preview } = await import('@/app/api/products/import/preview/route');
const { POST: commit } = await import('@/app/api/products/import/commit/route');
const { GET: template } = await import('@/app/api/products/import/template/route');

describe.skipIf(!hasDb)('Import produits — colonne Fournisseur', () => {
  let organizationId: string;
  let existingSupplierId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Import Supplier ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `imp-sup-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );
    const sup = await query<{ id: string }>(
      `INSERT INTO suppliers (organization_id, name) VALUES ($1, 'Grossiste Fleurs SA') RETURNING id`,
      [organizationId],
    );
    existingSupplierId = sup.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  function csvReq(csv: string) {
    return new Request('https://x.test', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv });
  }

  it('preview : pas d\'avertissement si le fournisseur existe déjà (insensible à la casse/espaces)', async () => {
    const csv = [
      'Nom;Fournisseur;Prix de vente TTC (€);Code TVA',
      'Tulipe;  grossiste fleurs sa  ;8,00;TVA20',
    ].join('\n');
    const res = await preview(csvReq(csv));
    const body = await res.json() as { rows: Array<{ supplier: string | null; warnings: string[] }> };
    // Le parseur trim déjà chaque cellule — seule la casse doit encore être
    // absorbée par la correspondance côté preview.
    expect(body.rows[0]!.supplier).toBe('grossiste fleurs sa');
    expect(body.rows[0]!.warnings).toEqual([]);
  });

  it('preview : avertit (sans bloquer) qu\'un fournisseur inconnu sera créé', async () => {
    const csv = [
      'Nom;Fournisseur;Prix de vente TTC (€);Code TVA',
      'Rose;Nouveau Fournisseur Jamais Vu;8,00;TVA20',
    ].join('\n');
    const res = await preview(csvReq(csv));
    const body = await res.json() as { rows: Array<{ warnings: string[]; errors: string[] }> };
    expect(body.rows[0]!.errors).toEqual([]);
    expect(body.rows[0]!.warnings).toEqual(['Fournisseur « Nouveau Fournisseur Jamais Vu » sera créé automatiquement']);
  });

  it('commit : réutilise le fournisseur existant (pas de doublon)', async () => {
    const res = await commit(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ name: `Lys ${randomUUID()}`, supplier: 'Grossiste Fleurs SA', sale_price_ttc: 12, tax_rate_code: 'TVA20' }],
      }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { inserted: number; failures: unknown[] };
    expect(body.inserted).toBe(1);
    expect(body.failures).toEqual([]);

    const dup = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM suppliers WHERE organization_id = $1 AND LOWER(TRIM(name)) = 'grossiste fleurs sa'`,
      [organizationId],
    );
    expect(dup.rows[0]!.count).toBe('1');

    const product = await query<{ supplier_id: string }>(
      `SELECT supplier_id FROM products WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [organizationId],
    );
    expect(product.rows[0]!.supplier_id).toBe(existingSupplierId);
  });

  it('commit : crée automatiquement un fournisseur inconnu et l\'associe au produit', async () => {
    const name = `Pépinière Test ${randomUUID()}`;
    const res = await commit(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ name: `Orchidée ${randomUUID()}`, supplier: name, sale_price_ttc: 22, tax_rate_code: 'TVA20' }],
      }),
    }));
    expect(res.status).toBe(200);

    const sup = await query<{ id: string }>(
      `SELECT id FROM suppliers WHERE organization_id = $1 AND name = $2`,
      [organizationId, name],
    );
    expect(sup.rowCount).toBe(1);

    const product = await query<{ supplier_id: string }>(
      `SELECT supplier_id FROM products WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [organizationId],
    );
    expect(product.rows[0]!.supplier_id).toBe(sup.rows[0]!.id);
  });

  it('commit : sans fournisseur renseigné, supplier_id reste NULL', async () => {
    const res = await commit(new Request('https://x.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ name: `Pivoine ${randomUUID()}`, sale_price_ttc: 9, tax_rate_code: 'TVA20' }],
      }),
    }));
    expect(res.status).toBe(200);
    const product = await query<{ supplier_id: string | null }>(
      `SELECT supplier_id FROM products WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [organizationId],
    );
    expect(product.rows[0]!.supplier_id).toBeNull();
  });

  it('modèle Excel : liste déroulante suggestive sur Catégorie et Fournisseur, pas bloquante', async () => {
    await query(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Fleurs coupées')`,
      [organizationId],
    );
    const res = await template();
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const listsWs = wb.getWorksheet('Listes');
    expect(listsWs).toBeTruthy();
    expect(listsWs!.state).toBe('hidden');
    expect(listsWs!.getCell(1, 1).value).toBe('Fleurs coupées');
    expect(listsWs!.getCell(1, 2).value).toBe('Grossiste Fleurs SA');

    const ws = wb.getWorksheet('Produits')!;
    const headerRow = ws.getRow(1).values as unknown[];
    const categoryCol = headerRow.findIndex((h) => h === 'Catégorie');
    const supplierCol = headerRow.findIndex((h) => h === 'Fournisseur');
    expect(categoryCol).toBeGreaterThan(0);
    expect(supplierCol).toBeGreaterThan(0);

    const catValidation = ws.getCell(2, categoryCol).dataValidation;
    expect(catValidation?.type).toBe('list');
    // Suggestive, pas bloquante : pas de message d'erreur posé.
    expect(catValidation?.showErrorMessage).toBeFalsy();
    expect(catValidation?.formulae?.[0]).toContain('Listes!$A$1');

    const supValidation = ws.getCell(2, supplierCol).dataValidation;
    expect(supValidation?.type).toBe('list');
    expect(supValidation?.formulae?.[0]).toContain('Listes!$B$1');
  });
});
