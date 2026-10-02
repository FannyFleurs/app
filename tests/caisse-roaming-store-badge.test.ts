import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Repère visuel « quelle boutique » en caisse, pour un poste itinérant
 * (pos.roaming_device) uniquement : un poste lié en permanence ne change
 * jamais de boutique, il n'a donc pas besoin de ce rappel — un compte
 * itinérant, si, pour éviter d'encaisser par erreur dans la mauvaise
 * boutique après un changement. Affiché en bas à gauche du bloc tuiles
 * catégories (app/(app)/caisse/CashRegister.tsx).
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (voir tests/ma-journee.test.ts pour le même choix) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('Caisse — repère boutique pour poste itinérant', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it("n'existe QUE pour un compte itinérant (canRoam), jamais pour un poste lié en permanence", () => {
    expect(page).toMatch(
      /const roamingStoreName = canRoam \? \(stores\.find\(\(s\) => s\.id === storeId\)\?\.name \?\? null\) : null;/,
    );
  });

  it('affiche le nom de la boutique courante, ancré au bloc catalogue (pas plein écran)', () => {
    expect(page).toMatch(/\{roamingStoreName && \(/);
    expect(page).toContain('<span>{roamingStoreName}</span>');
    // Ancré au conteneur `relative` du catalogue (bas-gauche DE ce bloc), pas
    // `fixed` sur tout l'écran comme le badge de synchronisation voisin.
    expect(page).toMatch(/absolute bottom-3 left-3[^"]*/);
  });
});
