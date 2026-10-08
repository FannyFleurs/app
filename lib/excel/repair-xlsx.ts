import JSZip from 'jszip';

/**
 * Certains outils (hors Microsoft Excel/Google Sheets/LibreOffice) génèrent
 * un .xlsx structurellement valide, mais dont le XML interne déclare l'espace
 * de noms principal avec un PRÉFIXE personnalisé — ex. `<x:workbook
 * xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` au
 * lieu de `<workbook xmlns="...">` (sans préfixe), pourtant les deux formes
 * sont des OOXML valides. ExcelJS ne reconnaît que la seconde : il échoue
 * silencieusement sur la première avec une erreur interne peu claire
 * (« Cannot read properties of undefined (reading 'sheets') ») — alors que le
 * fichier n'est PAS corrompu (Excel, Google Sheets, LibreOffice l'ouvrent
 * sans problème).
 *
 * Répare en retirant ce préfixe de chaque partie XML concernée (éléments et
 * déclaration xmlns), sans toucher aux AUTRES préfixes (ex. `r:` pour les
 * relations) ni au contenu des cellules. Retourne null si le fichier n'est
 * pas affecté (pas la peine de réparer), ou en cas d'échec de réparation —
 * l'appelant garde alors son message d'erreur habituel.
 */
export async function repairNamespacedXlsx(buf: Buffer): Promise<Buffer | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    let repaired = false;
    const nsUri = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    for (const name of Object.keys(zip.files)) {
      const file = zip.files[name];
      if (!file || file.dir || !name.endsWith('.xml')) continue;
      const text = await file.async('string');
      const m = text.match(new RegExp(`xmlns:([a-zA-Z0-9]+)="${nsUri.replace(/\//g, '\\/')}"`));
      if (!m) continue;
      const prefix = m[1];
      const fixed = text
        .replace(new RegExp(`<${prefix}:`, 'g'), '<')
        .replace(new RegExp(`</${prefix}:`, 'g'), '</')
        .replace(new RegExp(`\\sxmlns:${prefix}="${nsUri.replace(/\//g, '\\/')}"`), ` xmlns="${nsUri}"`);
      zip.file(name, fixed);
      repaired = true;
    }
    if (!repaired) return null;
    return await zip.generateAsync({ type: 'nodebuffer' });
  } catch {
    return null;
  }
}
