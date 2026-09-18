import { describe, it, expect } from 'vitest';
import { normalizeDay, type RawRevenueRow } from '@/lib/analytics/revenue-history-parse';
import { validateRevenueRows, normStoreName } from '@/lib/analytics/revenue-history-server';

/**
 * Import de l'historique de CA (comparatif N-1) : les dates arrivent sous des
 * formes variées (objet Date d'Excel, numéro de série, texte FR ou ISO) et la
 * validation doit rattacher la boutique par nom, refuser l'invalide et repérer
 * les doublons du fichier — c'est ce qui garde la base propre.
 */

describe('normalizeDay', () => {
  it('accepte un objet Date (cellule date Excel) sans décalage', () => {
    expect(normalizeDay(new Date(Date.UTC(2025, 11, 31)))).toBe('2025-12-31');
  });
  it('accepte le format français jj/mm/aaaa', () => {
    expect(normalizeDay('31/12/2025')).toBe('2025-12-31');
  });
  it('accepte le format ISO aaaa-mm-jj', () => {
    expect(normalizeDay('2025-01-05')).toBe('2025-01-05');
  });
  it('convertit un numéro de série Excel', () => {
    // 45657 = 31/12/2024 (base 1899-12-30).
    expect(normalizeDay(45657)).toBe('2024-12-31');
  });
  it('renvoie null pour une valeur non reconnue', () => {
    expect(normalizeDay('pas une date')).toBeNull();
    expect(normalizeDay('')).toBeNull();
  });
});

const STORES = new Map([[normStoreName('Plante Verte'), 'store-1']]);
const TODAY = '2026-01-01';

function raw(over: Partial<RawRevenueRow>): RawRevenueRow {
  return { day: '2025-12-31', store: 'Plante Verte', ca_ttc: 100, ca_ht: 90, tickets: 5, ...over };
}

describe('validateRevenueRows', () => {
  it('valide une ligne correcte et résout la boutique par nom (insensible à la casse)', () => {
    const [r] = validateRevenueRows([raw({ store: 'plante verte' })], STORES, TODAY);
    expect(r!.errors).toEqual([]);
    expect(r!.store_id).toBe('store-1');
  });

  it('refuse une boutique inconnue', () => {
    const [r] = validateRevenueRows([raw({ store: 'Autre' })], STORES, TODAY);
    expect(r!.store_id).toBeNull();
    expect(r!.errors.join(' ')).toMatch(/inconnue/i);
  });

  it('refuse une date invalide et une date future', () => {
    const [bad] = validateRevenueRows([raw({ day: 'xx' })], STORES, TODAY);
    expect(bad!.errors.join(' ')).toMatch(/date invalide/i);
    const [future] = validateRevenueRows([raw({ day: '2027-01-01' })], STORES, TODAY);
    expect(future!.errors.join(' ')).toMatch(/futur/i);
  });

  it('refuse un CA TTC manquant ou négatif', () => {
    const [missing] = validateRevenueRows([raw({ ca_ttc: null })], STORES, TODAY);
    expect(missing!.errors.join(' ')).toMatch(/CA TTC/i);
    const [neg] = validateRevenueRows([raw({ ca_ttc: -1 })], STORES, TODAY);
    expect(neg!.errors.join(' ')).toMatch(/négatif/i);
  });

  it('signale (warning) un CA HT supérieur au CA TTC sans bloquer', () => {
    const [r] = validateRevenueRows([raw({ ca_ttc: 100, ca_ht: 120 })], STORES, TODAY);
    expect(r!.errors).toEqual([]);
    expect(r!.warnings.join(' ')).toMatch(/HT supérieur/i);
  });

  it('repère un doublon (même boutique, même jour) dans le fichier', () => {
    const rows = validateRevenueRows([raw({}), raw({})], STORES, TODAY);
    expect(rows[0]!.errors.join(' ')).toMatch(/doublon/i);
    expect(rows[1]!.errors.join(' ')).toMatch(/doublon/i);
  });
});
