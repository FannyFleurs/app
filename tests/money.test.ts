import { describe, it, expect } from 'vitest';
import { computeLine, computeTotals, round2, eurosToCents, InvalidAmountCentsError } from '../lib/services/money';

describe('computeLine', () => {
  it('calcule HT/TVA/TTC à partir du TTC pour TVA 10%', () => {
    const l = computeLine({ unitPriceTtc: 11, quantity: 1, taxRate: 10 });
    expect(l.line_ttc).toBe(11);
    expect(l.line_ht).toBe(10);
    expect(l.line_tva).toBe(1);
  });
  it('applique une remise en € sur la ligne', () => {
    const l = computeLine({ unitPriceTtc: 22, quantity: 1, discountAmount: 2, taxRate: 10 });
    expect(l.line_ttc).toBe(20);
    expect(round2(l.line_ht + l.line_tva)).toBe(20);
  });
  it('ne tombe jamais sous zéro', () => {
    const l = computeLine({ unitPriceTtc: 5, quantity: 1, discountAmount: 50, taxRate: 20 });
    expect(l.line_ttc).toBe(0);
    expect(l.line_ht).toBe(0);
    expect(l.line_tva).toBe(0);
  });
});

describe('computeTotals', () => {
  it('regroupe les TVA par taux', () => {
    const lines = [
      computeLine({ unitPriceTtc: 11, quantity: 2, taxRate: 10 }),  // 22 TTC, 20 HT, 2 TVA
      computeLine({ unitPriceTtc: 12, quantity: 1, taxRate: 20 }),  // 12 TTC, 10 HT, 2 TVA
    ];
    const t = computeTotals(lines);
    expect(t.total_ttc).toBe(34);
    expect(t.total_ht).toBe(30);
    expect(t.total_tva).toBe(4);
    expect(t.tva_breakdown).toEqual([
      { rate: 20, base_ht: 10, tva: 2, ttc: 12 },
      { rate: 10, base_ht: 20, tva: 2, ttc: 22 },
    ]);
  });
});

describe('eurosToCents', () => {
  it('convertit un montant rond en centimes entiers', () => {
    expect(eurosToCents(50)).toBe(5000);
    expect(eurosToCents(25.5)).toBe(2550);
    expect(eurosToCents(10)).toBe(1000);
  });

  it('gère les résidus flottants classiques sans introduire d\'erreur', () => {
    // 30.1 + 0.2 vaut 30.299999999999997 en flottant natif.
    expect(eurosToCents(30.1 + 0.2)).toBe(3030);
  });

  it('rejette un montant négatif ou nul', () => {
    expect(() => eurosToCents(0)).toThrow(InvalidAmountCentsError);
    expect(() => eurosToCents(-10)).toThrow(InvalidAmountCentsError);
  });

  it('rejette NaN et Infinity', () => {
    expect(() => eurosToCents(NaN)).toThrow(InvalidAmountCentsError);
    expect(() => eurosToCents(Infinity)).toThrow(InvalidAmountCentsError);
    expect(() => eurosToCents(-Infinity)).toThrow(InvalidAmountCentsError);
  });

  it('rejette plus de 2 décimales (pas un montant en euros valide)', () => {
    expect(() => eurosToCents(12.345)).toThrow(InvalidAmountCentsError);
  });

  it('ne renvoie jamais un flottant', () => {
    const cents = eurosToCents(25.5);
    expect(Number.isInteger(cents)).toBe(true);
  });
});
