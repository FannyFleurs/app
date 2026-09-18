import { describe, it, expect } from 'vitest';
import { monthBounds } from '@/lib/analytics/targets';

/**
 * Objectifs de CA : les bornes d'un mois cadrent le calcul du réalisé et de la
 * projection. On vérifie les cas qui cassent naïvement (février bissextile,
 * mois à 30/31 jours).
 */
describe('monthBounds', () => {
  it('donne le premier et le dernier jour du mois', () => {
    expect(monthBounds(2026, 1)).toEqual({ start: '2026-01-01', end: '2026-01-31', daysInMonth: 31 });
    expect(monthBounds(2026, 4)).toEqual({ start: '2026-04-01', end: '2026-04-30', daysInMonth: 30 });
    expect(monthBounds(2026, 12)).toEqual({ start: '2026-12-01', end: '2026-12-31', daysInMonth: 31 });
  });

  it('gère février bissextile et non bissextile', () => {
    expect(monthBounds(2024, 2).end).toBe('2024-02-29'); // bissextile
    expect(monthBounds(2026, 2).end).toBe('2026-02-28');
  });

  it('zéro-remplit le mois', () => {
    expect(monthBounds(2026, 9).start).toBe('2026-09-01');
  });
});
