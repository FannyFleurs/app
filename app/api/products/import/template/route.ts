import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { IMPORT_COLUMNS } from '@/lib/products/import-parse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Nombre de lignes sur lesquelles la liste déroulante Catégorie/Fournisseur est posée. */
const VALIDATION_ROWS = 500;

/**
 * Modèle Excel (.xlsx) pour l'import de produits : entêtes en français,
 * trois lignes d'exemple. Le parseur accepte aussi bien ce format que
 * d'anciens CSV, avec entêtes français ou techniques.
 *
 * Les colonnes Catégorie et Fournisseur portent une liste déroulante
 * (validation de données Excel) proposant les valeurs déjà existantes dans
 * l'organisation — purement suggestive : saisir un nom absent de la liste
 * reste accepté (il sera créé automatiquement à l'import, comme aujourd'hui
 * pour la catégorie).
 */
export async function GET() {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;

  const [catRes, supRes] = await Promise.all([
    query<{ name: string }>(
      `SELECT name FROM product_categories WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
      [g.user.organizationId],
    ),
    query<{ name: string }>(
      `SELECT name FROM suppliers WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
      [g.user.organizationId],
    ),
  ]);
  const categoryNames = catRes.rows.map((r) => r.name);
  const supplierNames = supRes.rows.map((r) => r.name);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HelloPos';
  const ws = wb.addWorksheet('Produits');

  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  // Entête en gras, ligne figée.
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Trois lignes d'exemple.
  for (let i = 0; i < 3; i++) {
    const row: Record<string, string> = {};
    for (const c of IMPORT_COLUMNS) row[c.key] = c.examples[i] ?? '';
    ws.addRow(row);
  }

  // Feuille cachée portant les listes de valeurs (référencées par les
  // validations de données ci-dessous — une formule de liste Excel pointe
  // vers une plage de cellules, pas vers un tableau en dur).
  if (categoryNames.length > 0 || supplierNames.length > 0) {
    const listsWs = wb.addWorksheet('Listes', { state: 'hidden' });
    categoryNames.forEach((name, i) => { listsWs.getCell(i + 1, 1).value = name; });
    supplierNames.forEach((name, i) => { listsWs.getCell(i + 1, 2).value = name; });

    const applyListValidation = (colKey: 'category' | 'supplier', names: string[], listColLetter: 'A' | 'B') => {
      if (names.length === 0) return;
      const colIndex = IMPORT_COLUMNS.findIndex((c) => c.key === colKey) + 1;
      if (colIndex === 0) return;
      const formula = `Listes!$${listColLetter}$1:$${listColLetter}$${names.length}`;
      for (let rowNum = 2; rowNum <= VALIDATION_ROWS + 1; rowNum++) {
        ws.getCell(rowNum, colIndex).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [formula],
          // Suggestive, pas bloquante : un nom absent de la liste reste
          // accepté (il sera créé automatiquement à l'import).
          showErrorMessage: false,
        };
      }
    };
    applyListValidation('category', categoryNames, 'A');
    applyListValidation('supplier', supplierNames, 'B');
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-import-produits.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
