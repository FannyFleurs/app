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
