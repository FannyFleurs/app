import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requirePermission } from '@/lib/auth/guards';
import { IMPORT_COLUMNS } from '@/lib/products/import-parse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Modèle Excel (.xlsx) pour l'import de produits : entêtes en français,
 * trois lignes d'exemple. Le parseur accepte aussi bien ce format que
 * d'anciens CSV, avec entêtes français ou techniques.
 */
export async function GET() {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;

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
