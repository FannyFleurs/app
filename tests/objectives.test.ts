import { describe, it, expect } from 'vitest';
import { monthBreakdown, weekdayIndex, normalizeWeights, DEFAULT_WEIGHTS, type WeekWeights } from '@/lib/analytics/objectives';

/**
 * Répartition d'un objectif mensuel sur les jours selon un poids par jour de
 * semaine. On vérifie le cœur : jours fermés à 0, somme = objectif, "à date"
 * (théorique/réalisé), avance/retard et projection.
 */

describe('weekdayIndex (lundi = 0)', () => {
  it('mappe correctement', () => {
    expect(weekdayIndex('2026-09-14')).toBe(0); // lundi
    expect(weekdayIndex('2026-09-19')).toBe(5); // samedi
    expect(weekdayIndex('2026-09-20')).toBe(6); // dimanche
  });
});

describe('normalizeWeights', () => {
  it('complète et nettoie', () => {
    expect(normalizeWeights([2, 1, 1, 1, 1, 3])).toEqual([2, 1, 1, 1, 1, 3, 0]);
    expect(normalizeWeights(null)).toEqual(DEFAULT_WEIGHTS);
    expect(normalizeWeights([-1, 'x', 1, 1, 1, 1, 1])).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('monthBreakdown', () => {
  // Poids uniformes ouvert lun-sam, fermé dimanche.
  const weights: WeekWeights = [1, 1, 1, 1, 1, 1, 0];

  it('répartit tout l\'objectif et met les dimanches à 0', () => {
    const b = monthBreakdown({
      year: 2026, month: 9, objectiveMonth: 13000, weights,
      todayIso: '2026-10-01', realized: {},
    });
    const total = b.days.reduce((a, d) => a + d.objective, 0);
    expect(Math.round(total)).toBe(13000);
    // Dimanches fermés.
    for (const d of b.days) {
      if (d.weekday === 6) { expect(d.open).toBe(false); expect(d.objective).toBe(0); }
    }
    // Septembre 2026 : 26 jours ouverts (30 − 4 dimanches).
    expect(b.openDays).toBe(26);
  });

  it('samedi pondéré plus fort a un objectif plus élevé', () => {
    const w2: WeekWeights = [1, 1, 1, 1, 1, 2, 0];
    const b = monthBreakdown({ year: 2026, month: 9, objectiveMonth: 10000, weights: w2, todayIso: '2026-10-01', realized: {} });
    const sat = b.days.find((d) => d.date === '2026-09-05')!; // samedi
    const tue = b.days.find((d) => d.date === '2026-09-01')!; // mardi
    expect(sat.objective).toBeCloseTo(tue.objective * 2, 1);
  });

  it('calcule théorique/réalisé à date, avance/retard et projection', () => {
    // Mois en cours, aujourd'hui = 3 sept. Réalisé mar 1 = 600, mer 2 = 400.
    const b = monthBreakdown({
      year: 2026, month: 9, objectiveMonth: 13000, weights,
      todayIso: '2026-09-03',
      realized: { '2026-09-01': { ca: 600, tickets: 20 }, '2026-09-02': { ca: 400, tickets: 15 } },
    });
    expect(b.isCurrent).toBe(true);
    expect(b.realizedToDate).toBe(1000);
    // Théorique = objectifs des 1,2,3 (tous ouverts, mar/mer/jeu).
    const expTheo = b.days.filter((d) => d.date <= '2026-09-03').reduce((a, d) => a + d.objective, 0);
    expect(b.theoreticalToDate).toBeCloseTo(Number(expTheo.toFixed(2)), 1);
    expect(b.avanceRetard).toBeCloseTo(Number((1000 - expTheo).toFixed(2)), 1);
    // Projection = réalisé × objectif / théorique.
    expect(b.projection).toBeCloseTo(Number(((1000 * 13000) / expTheo).toFixed(2)), 0);
  });

  it('mois passé : projection = réalisé (mois terminé)', () => {
    const b = monthBreakdown({
      year: 2026, month: 8, objectiveMonth: 12000, weights,
      todayIso: '2026-09-18',
      realized: { '2026-08-10': { ca: 5000, tickets: 100 } },
    });
    expect(b.isPast).toBe(true);
    expect(b.projection).toBe(5000);
    expect(b.realizedToDate).toBe(5000);
  });
});
