import { describe, it, expect } from 'vitest';
import { ean13Svg, code128Svg, barcodeSvg } from '@/lib/services/barcode';
import { isValidEan13 } from '@/lib/services/ean';

/**
 * Code-barres d'étiquette.
 *
 * Le vrai piège : un code qui n'est pas un EAN-13 parfait (UPC-A à 12 chiffres,
 * EAN-8, SKU interne, ou 13 chiffres avec un checksum divergent issu d'un import)
 * ne doit PAS sortir sans code-barres. On bascule alors en Code 128, universel
 * et scannable, pour qu'une étiquette porte TOUJOURS un symbole.
 */

const VALID_EAN13 = '4006381333931';

function hasBars(svg: string | null): boolean {
  return !!svg && svg.includes('<svg') && svg.includes('<rect');
}

describe('EAN-13', () => {
  it('rend un symbole pour un code valide', () => {
    expect(isValidEan13(VALID_EAN13)).toBe(true);
    expect(hasBars(ean13Svg(VALID_EAN13))).toBe(true);
  });
  it('refuse un code non valide (null)', () => {
    expect(ean13Svg('4006381333930')).toBeNull(); // dernier chiffre faux
    expect(ean13Svg('123')).toBeNull();
  });
});

describe('barcodeSvg — jamais d\'étiquette sans code-barres', () => {
  it('EAN-13 valide -> symbole EAN-13', () => {
    expect(hasBars(barcodeSvg(VALID_EAN13))).toBe(true);
  });

  it('ignore les espaces autour du code', () => {
    expect(hasBars(barcodeSvg(`  ${VALID_EAN13} `))).toBe(true);
  });

  it('UPC-A (12 chiffres) -> symbole (complété en EAN-13)', () => {
    expect(hasBars(barcodeSvg('036000291452'))).toBe(true);
  });

  it('13 chiffres avec mauvais checksum -> repli Code 128 (pas de vide)', () => {
    // Le cas de l'utilisateur : des EAN qui ne s'imprimaient pas.
    const svg = barcodeSvg('4006381333930');
    expect(hasBars(svg)).toBe(true);
  });

  it('SKU alphanumérique -> repli Code 128', () => {
    expect(hasBars(barcodeSvg('ABC-123'))).toBe(true);
  });

  it('EAN-8 -> repli Code 128 (scannable)', () => {
    expect(hasBars(barcodeSvg('96385074'))).toBe(true);
  });

  it('vide -> null', () => {
    expect(barcodeSvg('')).toBeNull();
    expect(barcodeSvg('   ')).toBeNull();
    expect(barcodeSvg(null)).toBeNull();
  });
});

describe('Code 128', () => {
  it('encode chiffres et lettres', () => {
    expect(hasBars(code128Svg('12345'))).toBe(true);
    expect(hasBars(code128Svg('Bouquet-01'))).toBe(true);
  });
  it('vide -> null', () => {
    expect(code128Svg('  ')).toBeNull();
  });
});
