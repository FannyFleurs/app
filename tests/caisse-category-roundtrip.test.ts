import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Trois points de passage de category_id dans le cycle de vie d'un ticket en
 * caisse — voir tests/sale-lines-category-roundtrip.test.ts pour le même
 * bug côté service (SaleService.setLines). CashRegister.tsx est un très gros
 * composant client, sans rendu complet en test (même choix qu'ailleurs dans
 * ce fichier de tests) : on vérifie la présence et l'exactitude sur la
 * source.
 */
describe('Caisse — category_id survit au rappel + à la resynchro d\'un ticket', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('CartLine porte category_id', () => {
    expect(page).toMatch(/interface CartLine \{[\s\S]{0,700}?category_id\?: string \| null;/);
  });

  it('les deux restaurations d\'un ticket (montage + rappel) copient category_id depuis le serveur', () => {
    const occurrences = page.match(/category_id: \(l\.category_id as string \| null\) \?\? null,/g) ?? [];
    expect(occurrences).toHaveLength(2);
  });

  it('syncLines() retransmet category_id à chaque resynchro', () => {
    expect(page).toMatch(/category_id: l\.category_id \?\? null,/);
  });

  it('la mise en file hors-ligne (finalizeOffline) retransmet aussi category_id', () => {
    const offline = page.slice(page.indexOf('async function finalizeOffline'));
    expect(offline.slice(0, 1200)).toMatch(/category_id: l\.category_id \?\? null,/);
  });
});
