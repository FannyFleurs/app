import { describe, it, expect } from 'vitest';
import { computeLine, computeTotals, round2 } from '../lib/services/money';

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
