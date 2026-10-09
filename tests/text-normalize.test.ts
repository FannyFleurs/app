import { describe, it, expect } from 'vitest';
import { normSearch } from '@/lib/text/normalize';

describe('normSearch', () => {
  it('ignore la casse et les accents', () => {
    expect(normSearch('Alençon')).toBe('alencon');
    expect(normSearch('Élise')).toBe('elise');
    expect(normSearch('ALENÇON')).toBe('alencon');
  });
  it('null/undefined -> chaîne vide', () => {
    expect(normSearch(null)).toBe('');
    expect(normSearch(undefined)).toBe('');
  });
  it('une recherche sans accent retrouve un texte accentué', () => {
    expect(normSearch('Alençon').includes(normSearch('alencon'))).toBe(true);
    expect(normSearch('Café de l\'ancre').includes(normSearch('cafe'))).toBe(true);
  });
});
