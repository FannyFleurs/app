import { isValidEan13 } from './ean';

// Encodage EAN-13 → SVG (aucune dépendance). Utilisé pour les étiquettes.

const L: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
};
const G: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
};
const R: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
};
// Parité des 6 chiffres de gauche selon le 1er chiffre.
const PARITY: Record<string, string> = {
  '0': 'LLLLLL', '1': 'LLGLGG', '2': 'LLGGLG', '3': 'LLGGGL', '4': 'LGLLGG',
  '5': 'LGGLLG', '6': 'LGGGLL', '7': 'LGLGLG', '8': 'LGLGGL', '9': 'LGGLGL',
};

/** Suite de modules binaires (1 = barre noire) d'un EAN-13. */
function ean13Modules(code: string): string {
  const first = code[0]!;
  const left = code.slice(1, 7);
  const right = code.slice(7, 13);
  const parity = PARITY[first]!;
  let bits = '101'; // garde gauche
  for (let i = 0; i < 6; i++) {
    const d = left[i]!;
    bits += parity[i] === 'L' ? L[d]! : G[d]!;
  }
  bits += '01010'; // garde centrale
  for (let i = 0; i < 6; i++) bits += R[right[i]!]!;
  bits += '101'; // garde droite
  return bits;
}

/**
 * Rend un code-barres EAN-13 en SVG (chaîne). `module` = largeur d'un module
 * en px, `height` = hauteur des barres. Le SVG inclut le numéro lisible.
 * Renvoie null si le code n'est pas un EAN-13 valide.
 */
export function ean13Svg(
  code: string,
  { module = 2, height = 60 }: { module?: number; height?: number } = {},
): string | null {
  if (!isValidEan13(code)) return null;
  const bits = ean13Modules(code);
  const quiet = 11 * module; // marge silencieuse
  const width = quiet * 2 + bits.length * module;
  const textH = 14;
  const total = height + textH;

  let rects = '';
  let x = quiet;
  for (const b of bits) {
    if (b === '1') rects += `<rect x="${x}" y="0" width="${module}" height="${height}" fill="#000"/>`;
    x += module;
  }
  // Numéro lisible sous les barres.
  const cx = width / 2;
  const txt =
    `<text x="${cx}" y="${height + textH - 2}" text-anchor="middle" font-family="monospace" font-size="${textH - 2}" fill="#000">${code}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${total}" width="${width}" height="${total}">${rects}${txt}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Table des largeurs Code 128 (index = valeur du symbole 0..106). 103/104/105 =
// Start A/B/C, 106 = Stop. Chaque motif alterne barre/espace en commençant par
// une barre ; le Stop (2331112) inclut sa barre de terminaison.
const C128_WIDTHS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];
const C128_START_B = 104;
const C128_STOP = 106;

/** Suite de modules binaires (1 = barre) d'une chaîne encodée en Code 128 B. */
function code128bBits(text: string): string | null {
  const values: number[] = [];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return null; // hors du jeu imprimable du subset B
    values.push(c - 32);
  }
  if (values.length === 0) return null;
  let sum = C128_START_B;
  values.forEach((v, i) => { sum += v * (i + 1); });
  const check = sum % 103;
  const symbols = [C128_START_B, ...values, check, C128_STOP];
  let bits = '';
  for (const s of symbols) {
    const widths = C128_WIDTHS[s]!;
    let bar = true;
    for (const w of widths) {
      bits += (bar ? '1' : '0').repeat(Number(w));
      bar = !bar;
    }
  }
  return bits;
}

/**
 * Rend un code-barres Code 128 (subset B) en SVG. Universel : encode chiffres
 * ET lettres, donc sert de repli quand un code n'est pas un EAN-13 valide
 * (UPC-A, EAN-8, SKU interne, checksum divergent…). Renvoie null si vide ou
 * non encodable.
 */
export function code128Svg(
  code: string,
  { module = 2, height = 60 }: { module?: number; height?: number } = {},
): string | null {
  const text = String(code ?? '').trim();
  const bits = code128bBits(text);
  if (!bits) return null;
  const quiet = 10 * module;
  const width = quiet * 2 + bits.length * module;
  const textH = 14;
  const total = height + textH;

  let rects = '';
  let x = quiet;
  for (const b of bits) {
    if (b === '1') rects += `<rect x="${x}" y="0" width="${module}" height="${height}" fill="#000"/>`;
    x += module;
  }
  const cx = width / 2;
  const txt =
    `<text x="${cx}" y="${height + textH - 2}" text-anchor="middle" font-family="monospace" font-size="${textH - 2}" fill="#000">${escapeXml(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${total}" width="${width}" height="${total}">${rects}${txt}</svg>`;
}

/**
 * Code-barres pour une étiquette, TOUJOURS imprimable si le code est non vide :
 *  - EAN-13 valide (après trim)          -> symbole EAN-13 ;
 *  - 12 chiffres (UPC-A)                 -> complété d'un 0 en EAN-13 ;
 *  - tout le reste (EAN-8, SKU, mauvais
 *    checksum, préfixe magasin…)         -> Code 128 (repli scannable).
 * Renvoie null seulement si le code est vide.
 */
export function barcodeSvg(
  code: string | null | undefined,
  opts: { module?: number; height?: number } = {},
): string | null {
  const raw = String(code ?? '').trim();
  if (!raw) return null;
  if (isValidEan13(raw)) return ean13Svg(raw, opts);
  if (/^\d{12}$/.test(raw)) {
    const padded = `0${raw}`;
    if (isValidEan13(padded)) return ean13Svg(padded, opts);
  }
  return code128Svg(raw, opts);
}
