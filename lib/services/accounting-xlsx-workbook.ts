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
/** Valeur de stock d'une catégorie (onglet « Valeur de stock »). */
export interface StockCategoryValue {
  category: string;
  qty: number;
  /** Valorisation au prix de revient HT. */
  value: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function renderSalesXlsx(
  totals: AccountTotal[], periodEnd: string, stock: StockCategoryValue[] = [],
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

  // -------- Onglet « Valeur de stock » (par catégorie + total) --------
  // Stock valorisé au prix de revient HT (products.purchase_price_ht), quantités
  // courantes (stock_levels). Un produit sans prix de revient compte pour 0.
  const ws2 = wb.addWorksheet('Valeur de stock');
  ws2.getColumn(1).width = 42;
  ws2.getColumn(2).width = 14;
  ws2.getColumn(3).width = 18;
  ws2.getColumn(2).numFmt = '0.000';
  ws2.getColumn(3).numFmt = '0.00';

  ws2.addRow(['Valeur du stock par catégorie']).font = { bold: true, size: 12 };
  ws2.addRow(['Valorisation au prix de revient HT · stock au jour de l’export']).font = { italic: true, size: 9 };
  ws2.addRow([]);
  const head = ws2.addRow(['Catégorie', 'Quantité', 'Valeur HT (€)']);
  head.font = { bold: true };

  let totalQty = 0;
  let totalVal = 0;
  for (const s of stock) {
    ws2.addRow([s.category, r3(s.qty), r2(s.value)]);
    totalQty += s.qty;
    totalVal += s.value;
  }
  if (stock.length === 0) {
    ws2.addRow(['Aucun article en stock suivi.', null, null]);
  }
  ws2.addRow([]);
  const stockTotalRow = ws2.addRow(['TOTAL', r3(totalQty), r2(totalVal)]);
  stockTotalRow.font = { bold: true };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
