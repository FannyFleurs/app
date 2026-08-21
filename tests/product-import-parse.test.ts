import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseProductImport, IMPORT_COLUMNS } from '@/lib/products/import-parse';

async function makeXlsx(rows: Record<string, string>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Produits');
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key }));
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseProductImport', () => {
  it('XLSX avec entêtes français', async () => {
    const buf = await makeXlsx([
      { name: 'Bougie parfumée', sku: 'DECO-001', barcode: '3760000000011', category: 'Décoration', sale_price_ttc: '18,90', purchase_price_ht: '7,50', tax_rate_code: 'TVA20', color: '#F4D7D7', is_top_product: 'oui', visible_in_pos: 'oui', is_active: 'oui' },
      { name: 'Écharpe laine', sku: 'MODE-002', barcode: '', category: 'Mode', sale_price_ttc: '45', purchase_price_ht: '18', tax_rate_code: 'TVA20', color: '', is_top_product: 'non', visible_in_pos: 'oui', is_active: 'oui' },
    ]);
    const rows = await parseProductImport(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Bougie parfumée', sku: 'DECO-001', barcode: '3760000000011',
      category: 'Décoration', sale_price_ttc: 18.9, purchase_price_ht: 7.5,
      tax_rate_code: 'TVA20', color: '#F4D7D7', is_top_product: true,
      visible_in_pos: true, is_active: true,
    });
    expect(rows[1]!.is_top_product).toBe(false);
    expect(rows[1]!.barcode).toBeNull();
    expect(rows[1]!.sale_price_ttc).toBe(45);
  });

  it('CSV avec entêtes français (point-virgule, virgule décimale)', async () => {
    const csv = [
      'Nom;Référence (SKU);Code-barres;Catégorie;Prix de vente TTC (€);Prix d\'achat HT (€);Code TVA;Couleur (#RRGGBB);Produit favori (oui/non);Visible en caisse (oui/non);Actif (oui/non)',
      'Mug grès;TABLE-001;3760000000165;Art de la table;14,90;5,00;TVA20;;non;oui;oui',
    ].join('\n');
    const rows = await parseProductImport(Buffer.from(csv, 'utf8'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Mug grès', sku: 'TABLE-001', category: 'Art de la table',
      sale_price_ttc: 14.9, purchase_price_ht: 5, tax_rate_code: 'TVA20',
      is_top_product: false, visible_in_pos: true, is_active: true,
    });
  });

  it('CSV avec anciens entêtes techniques (rétrocompat)', async () => {
    const csv = [
      'name,sku,barcode,category,sale_price_ttc,purchase_price_ht,tax_rate_code,color,is_top_product,visible_in_pos,is_active',
      'Ancien produit,OLD-1,,Divers,10.00,4.00,TVA20,,true,true,true',
    ].join('\n');
    const rows = await parseProductImport(Buffer.from(csv, 'utf8'));
    expect(rows[0]).toMatchObject({ name: 'Ancien produit', sku: 'OLD-1', sale_price_ttc: 10, is_top_product: true });
  });
});
