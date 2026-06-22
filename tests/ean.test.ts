import { describe, it, expect } from 'vitest';
import { generateEan13, isValidEan13 } from '../lib/services/ean';

describe('generateEan13', () => {
  it('génère un code à 13 chiffres', () => {
    const ean = generateEan13();
    expect(ean).toMatch(/^\d{13}$/);
  });
  it('produit un code valide (checksum correcte) à chaque appel', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidEan13(generateEan13())).toBe(true);
    }
  });
  it('respecte le préfixe demandé', () => {
    expect(generateEan13('25').startsWith('25')).toBe(true);
  });
});

describe('isValidEan13', () => {
  it('rejette une chaîne non numérique ou trop courte', () => {
    expect(isValidEan13('abc')).toBe(false);
    expect(isValidEan13('123')).toBe(false);
    expect(isValidEan13('12345678901234')).toBe(false);
  });
  it('détecte une checksum erronée', () => {
    const valid = generateEan13('20');
    // on incrémente le dernier digit pour casser la checksum
    const broken = valid.slice(0, 12) + ((Number(valid[12]) + 1) % 10).toString();
    expect(isValidEan13(broken)).toBe(false);
  });
});
