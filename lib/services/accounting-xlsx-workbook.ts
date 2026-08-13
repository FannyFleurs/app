import 'server-only';
import ExcelJS from 'exceljs';
import { type AccountTotal } from '@/lib/services/accounting-mapping';
import { buildSalesXlsx } from '@/lib/services/accounting-xlsx';

/**
 * Rendu Excel de l'export « Ventes par compte ».
 *
 * La forme des lignes est décidée par `buildSalesXlsx` (module pur, testé) ;
 * ici on ne fait que la poser dans un classeur exceljs, avec l'unique feuille
 * « Feuille à exporter » demandée. Les formats de colonnes reprennent ceux du
 * fichier modèle : date en A, montants à deux décimales en D et E, comptes en
 * F. Le total en bas somme les colonnes D et E par formule, valeur mise en
 * cache pour les logiciels qui n'évaluent pas les formules.
 */
export async function renderSalesXlsx(
  totals: AccountTotal[], periodEnd: string,
): Promise<Buffer> {
  const { rows, totalD, totalE } = buildSalesXlsx(totals, periodEnd);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HelloPos';
  wb.created = new Date(`${periodEnd}T12:00:00Z`);
  const ws = wb.addWorksheet('Feuille à exporter');

  // Largeurs et formats calqués sur le modèle.
  ws.getColumn(1).numFmt = 'dd/mm/yyyy';
  ws.getColumn(2).width = 51;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).numFmt = '0.00';
  ws.getColumn(5).numFmt = '0.00';

  for (const r of rows) {
    ws.addRow([r.date ?? null, r.label ?? null, r.marker ?? null, r.d ?? null, r.e ?? null, r.account ?? null]);
  }

  // Ligne vide entre les écritures et le total, comme dans le modèle.
  ws.addRow([]);

  // Total : D et E sommées sur les lignes d'écriture (1 → nombre de lignes).
  const last = rows.length;
  const totalRow = ws.addRow([]);
  const dCell = totalRow.getCell(4);
  const eCell = totalRow.getCell(5);
  dCell.value = { formula: `SUM(D1:D${last})`, result: totalD };
  eCell.value = { formula: `SUM(E1:E${last})`, result: totalE };
  dCell.numFmt = '0.00';
  eCell.numFmt = '0.00';

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
