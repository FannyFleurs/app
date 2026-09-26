import { inflateSync } from 'node:zlib';

/**
 * Extraction de texte APPROXIMATIVE d'un PDF généré par PDFKit — suffisante
 * pour des assertions `.toContain(...)` en test, pas un lecteur PDF complet.
 *
 * PDFKit (polices standard Helvetica*, non embarquées) encode le texte des
 * opérateurs Tj/TJ en chaînes hexadécimales `<...>`, un octet par glyphe,
 * suivant WinAnsiEncoding (CP1252) — PAS UTF-8. Cette fonction : repère
 * chaque flux `stream ... endstream` compressé (FlateDecode, activé par
 * défaut par PDFKit), le décompresse, puis concatène le décodage CP1252 de
 * CHAQUE chaîne hexadécimale rencontrée dans le flux (les nombres de
 * crénage entre chaînes, dans les tableaux `TJ`, sont ignorés — ce ne sont
 * jamais des caractères).
 *
 * Le résultat n'a PAS d'espace entre deux appels `doc.text()` distincts
 * (ce n'est pas un rendu fidèle) : suffisant pour vérifier qu'un mot/nombre
 * donné apparaît bien QUELQUE PART dans le PDF, pas pour reconstituer sa
 * mise en page.
 */
export function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const streamRe = /<<([^>]*)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const hexRe = /<([0-9A-Fa-f]+)>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    const dict = m[1]!;
    if (!/FlateDecode/.test(dict)) continue;
    let inflated: string;
    try {
      inflated = inflateSync(Buffer.from(m[2]!, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    let hm: RegExpExecArray | null;
    while ((hm = hexRe.exec(inflated))) {
      out += decodeWinAnsiHex(hm[1]!);
    }
  }
  return out;
}

/** Comme extractPdfText, mais avec tous les espaces (y compris insécables)
 *  retirés — pour retrouver un code groupé par PDFKit (ex. "2900 0000 0001
 *  5") en cherchant sa forme compacte ("2900000000015"). */
export function extractPdfTextCompact(pdf: Buffer): string {
  return extractPdfText(pdf).replace(/[\s ]+/g, '');
}

// CP1252 (WinAnsiEncoding) ne coïncide avec Latin-1 QUE hors de 0x80-0x9F —
// cette plage porte des caractères typographiques (apostrophe courbe,
// tirets, guillemets, Euro…) qu'un décodage Latin-1 naïf transformerait en
// caractères de contrôle invisibles.
const CP1252_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
  0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
  0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

function decodeWinAnsiHex(hex: string): string {
  let s = '';
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) continue;
    s += byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH[byte] ?? '') : String.fromCharCode(byte);
  }
  return s;
}
