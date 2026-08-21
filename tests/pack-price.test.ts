import { describe, it, expect } from 'vitest';
import { computePackPrice, packComponentsTotal } from '@/lib/products/pack';

describe('pack pricing', () => {
  const comps = [
    { price: 18.90, quantity: 1 },
    { price: 12.00, quantity: 2 },
    { price: 6.50, quantity: 1 },
  ];

  it('total des composants', () => {
    expect(packComponentsTotal(comps)).toBe(49.4); // 18.90 + 24 + 6.50
  });

  it('prix = total - remise', () => {
    expect(computePackPrice(comps, 5)).toBe(44.4);
    expect(computePackPrice(comps, 0)).toBe(49.4);
  });

  it('jamais négatif', () => {
    expect(computePackPrice(comps, 999)).toBe(0);
  });

  it('remise absente ou invalide traitée comme 0', () => {
    expect(computePackPrice(comps, Number.NaN)).toBe(49.4);
    expect(computePackPrice(comps, -3)).toBe(49.4);
  });
});
