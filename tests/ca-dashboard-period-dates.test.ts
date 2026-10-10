// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { periodDates, previousRange, localIso } from '@/app/ca/CADashboard';

/**
 * Bug remonté en production : sur l'app CA, "Ce mois" (et dans une moindre
 * mesure "Aujourd'hui" juste après minuit) ne donnait pas la même fourchette
 * de dates que le tableau de bord back-office, pour la MÊME boutique sur la
 * MÊME période réelle — un import d'historique de CA s'arrêtant au 30/09
 * se retrouvait inclus dans "Ce mois" d'octobre, gonflant largement le CA et
 * le nombre de ventes affichés (l'import contient un gros total cumulé sur
 * ce dernier jour, pour une période antérieure à HelloPos).
 *
 * Cause : `periodDates()`/`previousRange()` construisaient la date avec
 * `new Date(annee, mois, 1)` (minuit LOCAL), puis la formataient avec
 * `.toISOString().slice(0, 10)` — qui convertit D'ABORD en UTC. En heure de
 * Paris (en avance sur UTC), minuit local le 1er du mois tombe à 22h/23h UTC
 * LA VEILLE : la date ISO obtenue était systématiquement celle du dernier
 * jour du mois PRÉCÉDENT, pas le 1er du mois en cours. Le même mécanisme
 * décale aussi "Aujourd'hui" dans la première heure après minuit local.
 *
 * Corrigé en formatant directement depuis les composants LOCAUX du Date
 * (getFullYear/getMonth/getDate), sans jamais repasser par UTC.
 *
 * NB sur les tests ci-dessous : le bac à sable d'exécution tourne en UTC, et
 * Node fige le fuseau résolu par le moteur au démarrage du processus — un
 * `process.env.TZ = 'Europe/Paris'` (même posé AVANT le premier `new Date()`,
 * y compris via `test.env` de Vitest) n'est PAS repris en cours de run.
 * Impossible donc de reproduire ici, en conditions réelles, le décalage
 * UTC/Paris qui a causé le bug (en TZ UTC, minuit local = minuit UTC : les
 * deux implémentations, fautive ou corrigée, donnent alors le même résultat).
 * On vérifie donc (1) la non-régression fonctionnelle dans le fuseau du bac à
 * sable, et (2) — garde-fou direct contre la cause exacte du bug — qu'aucune
 * des fonctions de bornage de date ne repasse par `toISOString()`.
 */
describe('App CA — périodes de date (periodDates / previousRange)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"Ce mois" démarre le 1er du mois en cours et s\'arrête aujourd\'hui', () => {
    vi.setSystemTime(new Date('2026-10-10T18:00:00Z'));
    const range = periodDates('month', '', '');
    expect(range.from).toBe('2026-10-01');
    expect(range.to).toBe('2026-10-10');
  });

  it('"Aujourd\'hui" et "Hier" donnent le bon jour calendaire', () => {
    vi.setSystemTime(new Date('2026-10-10T18:00:00Z'));
    expect(periodDates('today', '', '')).toEqual({ from: '2026-10-10', to: '2026-10-10' });
    expect(periodDates('yesterday', '', '')).toEqual({ from: '2026-10-09', to: '2026-10-09' });
  });

  it('previousRange décale d\'un an sans glisser de jour', () => {
    const prev = previousRange('2026-11-01', '2026-11-10');
    expect(prev).toEqual({ from: '2025-11-01', to: '2025-11-10' });
  });

  it('localIso formate depuis les composants locaux du Date (pas via toISOString/UTC)', () => {
    const d = new Date(2026, 0, 1, 0, 0, 0);
    expect(localIso(d)).toBe('2026-01-01');
    expect(localIso(d)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  });

  it('garde-fou : aucune fonction de bornage de date de l\'app CA ne repasse par toISOString (cause exacte du bug)', () => {
    const src = readFileSync(new URL('../app/ca/CADashboard.tsx', import.meta.url), 'utf8');
    const start = src.indexOf('function periodDates');
    const end = src.indexOf('export default function CADashboard');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const dateLogic = src.slice(start, end);
    expect(dateLogic).not.toContain('toISOString');
  });
});
