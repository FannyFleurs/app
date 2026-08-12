import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ventilationHoraire, cumule } from '@/app/(app)/ma-journee/MaJourneeClient';

/**
 * « Ma journée » : l'écran du comptoir.
 *
 * Il tient en une page ce qu'on vient y chercher — l'état de la caisse, le
 * chiffre du jour, le tiroir, les tickets — et il ne se lit que s'il dit vrai
 * jusqu'au centime : le montant attendu doit être celui que la clôture
 * confrontera au comptage.
 */

const vente = (iso: string, ttc: string, status = 'validated') => ({
  validated_at: iso, total_ttc: ttc, status,
});

describe('Courbe du jour', () => {
  it('range chaque vente à son heure de Paris', () => {
    // 07:30 UTC = 09:30 à Paris en été. Lue dans le fuseau du serveur, la
    // vente serait tombée deux heures trop tôt.
    const h = ventilationHoraire([vente('2026-08-12T07:30:00.000Z', '42')]);
    expect(h).toHaveLength(24);
    expect(h[9]).toBe(42);
    expect(h[7]).toBe(0);
  });

  it('produit des nombres, pas des NaN', () => {
    // Le format français rend « 10 h » : Number n'en tire rien et toute la
    // courbe retombait à plat. Le symptôme se voit sur la somme.
    const h = ventilationHoraire([
      vente('2026-08-12T09:10:00.000Z', '10'),
      vente('2026-08-12T09:50:00.000Z', '5.50'),
    ]);
    expect(h.every((v) => Number.isFinite(v))).toBe(true);
    expect(h.reduce((s, v) => s + v, 0)).toBeCloseTo(15.5, 2);
  });

  it('ignore une vente annulée par avoir', () => {
    const h = ventilationHoraire([
      vente('2026-08-12T09:00:00.000Z', '30'),
      vente('2026-08-12T09:00:00.000Z', '30', 'cancelled_by_credit_note'),
    ]);
    expect(h[11]).toBe(30);
  });

  it('garde une vente de fin de soirée dans sa journée', () => {
    // 21:50 UTC = 23:50 à Paris : dernier créneau, pas le lendemain.
    expect(ventilationHoraire([vente('2026-08-12T21:50:00.000Z', '18')])[23]).toBe(18);
  });

  it('cumule sans perdre le total', () => {
    expect(cumule([1, 2, 3])).toEqual([1, 3, 6]);
    expect(cumule([0, 0])).toEqual([0, 0]);
  });
});

describe('Trésorerie espèces', () => {
  const route = readFileSync('app/api/sales/today/route.ts', 'utf8');

  it('annonce le fond de caisse de l\'ouverture', () => {
    expect(route).toMatch(/opening_float: openingFloat/);
    expect(readFileSync('app/(app)/ma-journee/MaJourneeClient.tsx', 'utf8'))
      .toContain('Fond de caisse (ouverture)');
  });

  it('attend dans le tiroir ce que la clôture y comptera', () => {
    // Même formule que cash-session-service : fond + espèces + entrées −
    // sorties. Sans le fond, l'écran annonçait un montant que le comptage du
    // soir ne pouvait pas retrouver.
    expect(route).toMatch(/openingFloat \+ cashSales \+ cashIn - cashOut/);
    expect(readFileSync('lib/services/cash-session-service.ts', 'utf8'))
      .toMatch(/opening \+ salesCash \+ ins - outs/);
  });
});

describe('Composition de l\'écran', () => {
  const page = readFileSync('app/(app)/ma-journee/MaJourneeClient.tsx', 'utf8');

  it('porte les blocs de la journée', () => {
    for (const bloc of [
      'Caisse ouverte à', 'CA TTC', 'Trésorerie espèces', 'Espèces attendues',
      'Clôturer la journée', 'Top paiement', 'Évolution du CA TTC',
      'Répartition des ventes', 'Top catégories (CA TTC)', 'Dernières commandes',
      'Actions rapides',
    ]) {
      expect(page, bloc).toContain(bloc);
    }
  });

  it('garde les gestes du comptoir accessibles', () => {
    // La recherche/scan de ticket et le rapport X sont le travail réel de cet
    // écran : la mise en page ne doit pas les avoir emportés.
    expect(page).toContain('Rechercher ou scanner un numéro de ticket');
    expect(page).toContain('/api/cash-sessions/open-drawer');
    expect(page).toMatch(/setMode\('complet'\)/);
    expect(page).toContain('Imprimer le X');
  });
});
