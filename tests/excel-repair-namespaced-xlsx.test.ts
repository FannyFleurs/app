import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { repairNamespacedXlsx } from '@/lib/excel/repair-xlsx';
import { parseCustomerWorkbook } from '@/lib/customers/import-core';

/**
 * Bug remonté en production (2026-10-08) : un import clients a été rejeté
 * en bloc (0 ligne importée) sans que l'utilisateur comprenne pourquoi — le
 * fichier .xlsx reçu était VALIDE (ouvrable sans problème dans Excel,
 * Google Sheets, LibreOffice, openpyxl) mais généré par un outil qui
 * préfixe l'espace de noms principal du XML interne (ex. `<x:workbook
 * xmlns:x="...spreadsheetml...">` au lieu de `<workbook xmlns="...">`),
 * une forme qu'ExcelJS ne reconnaît pas et sur laquelle il échoue
 * silencieusement (« Cannot read properties of undefined (reading
 * 'sheets') »).
 *
 * Reproduit ici en construisant à la main un .xlsx minimal valide mais
 * avec ce préfixe, pour vérifier que repairNamespacedXlsx() (et donc
 * parseCustomerWorkbook, qui l'utilise en repli) le lit correctement.
 */
async function buildNamespacedXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" /></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" Id="R1" /></Relationships>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="Rsheet1" /></Relationships>`);
  // Préfixe « x: » sur l'espace de noms principal — la forme qui casse ExcelJS.
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet name="Clients" sheetId="1" r:id="Rsheet1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`);
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Type</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>Prénom</x:t></x:is></x:c><x:c r="C1" t="inlineStr"><x:is><x:t>Nom</x:t></x:is></x:c></x:row><x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>particulier</x:t></x:is></x:c><x:c r="B2" t="inlineStr"><x:is><x:t>Marie</x:t></x:is></x:c><x:c r="C2" t="inlineStr"><x:is><x:t>Dupont</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('repairNamespacedXlsx', () => {
  it('répare un .xlsx dont le XML interne préfixe l\'espace de noms principal (ExcelJS le rejette sinon)', async () => {
    const buf = await buildNamespacedXlsx();
    const repaired = await repairNamespacedXlsx(buf);
    expect(repaired).not.toBeNull();

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(repaired!);
    const ws = wb.worksheets[0]!;
    expect(ws.getCell('A1').value).toBe('Type');
    expect(ws.getCell('A2').value).toBe('particulier');
    expect(ws.getCell('C2').value).toBe('Dupont');
  });

  it('ne touche pas à un fichier déjà standard (pas de préfixe) : retourne null', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clients');
    ws.addRow(['Type']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const repaired = await repairNamespacedXlsx(buf);
    expect(repaired).toBeNull();
  });

  it('parseCustomerWorkbook lit directement un fichier préfixé via le repli automatique (pas d\'erreur « illisible »)', async () => {
    const buf = await buildNamespacedXlsx();
    const { headerError, rows } = await parseCustomerWorkbook(buf, 0.05);
    expect(headerError).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'particulier', first: 'Marie', last: 'Dupont' });
  });
});
