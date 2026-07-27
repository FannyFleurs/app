import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requirePermission } from '@/lib/auth/guards';
import { CUSTOMER_IMPORT_COLUMNS, CUSTOMER_TYPES } from '@/lib/customers/import-columns';

export const dynamic = 'force-dynamic';

/**
 * Modèle Excel (.xlsx) à remplir puis réimporter via /api/customers/import.
 * Feuille 1 « Clients » : en-têtes + une ligne d'exemple.
 * Feuille 2 « Instructions » : rappel des règles de remplissage.
 */
export async function GET() {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HelloPos';
  wb.created = new Date();

  const ws = wb.addWorksheet('Clients');
  ws.columns = CUSTOMER_IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  // En-tête en gras sur fond clair.
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF1ED' } };
    cell.alignment = { vertical: 'middle' };
  });
  head.height = 20;
  // Une ligne d'exemple (à supprimer ou écraser).
  ws.addRow(Object.fromEntries(CUSTOMER_IMPORT_COLUMNS.map((c) => [c.key, c.example])));

  const info = wb.addWorksheet('Instructions');
  info.columns = [{ width: 90 }];
  const lines = [
    'Comment remplir ce fichier',
    '',
    '1. Remplissez une ligne par client dans la feuille « Clients ».',
    '2. La ligne d’exemple (Marie Dupont) peut être supprimée ou écrasée.',
    `3. Colonne « Type » : ${CUSTOMER_TYPES.join(', ')} (par défaut : particulier).`,
    '4. Particulier : renseignez Prénom / Nom. Professionnel / collectivité / association : renseignez Société.',
    '5. Colonnes « Consentement » : écrivez oui ou non.',
    '6. Colonne « Points fidélité » : un nombre entier (ex. 120). Laissez vide pour ne pas toucher aux points.',
    '7. À l’import, vous choisirez la ou les boutiques concernées : les points seront crédités sur leur compte fidélité.',
    '8. Un client existant est reconnu par son Email : ses informations sont alors mises à jour (pas de doublon).',
    '',
    'Ne modifiez pas la ligne d’en-têtes (elle sert à identifier les colonnes).',
  ];
  lines.forEach((t, i) => {
    const row = info.addRow([t]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-clients-hellopos.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
