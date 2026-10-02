import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Repère visuel « quelle boutique » en caisse, pour une SESSION itinérante
 * en cours (isRoamingSession) uniquement : un poste lié en permanence ne
 * change jamais de boutique, il n'a donc pas besoin de ce rappel — même un
 * compte qui A la permission pos.roaming_device (ex. owner) mais travaille
 * ce jour-là sur un poste lié en permanence ne doit pas le voir. C'est
 * `isRoamingSession` (choix itinérant réellement actif) qui gate l'affichage,
 * pas `canRoam` (simple permission) — sinon un owner voit le badge même sur
 * une caisse fixe. Affiché en bas à gauche du bloc tuiles catégories
 * (app/(app)/caisse/CashRegister.tsx).
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (voir tests/ma-journee.test.ts pour le même choix) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('Caisse — repère boutique pour poste itinérant', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it("n'existe QUE pendant une session itinérante active (isRoamingSession), jamais pour un poste lié en permanence", () => {
    expect(page).toMatch(
      /const roamingStoreName = isRoamingSession \? \(stores\.find\(\(s\) => s\.id === storeId\)\?\.name \?\? null\) : null;/,
    );
    // isRoamingSession passe à true UNIQUEMENT dans la branche "choix
    // itinérant encore valide" de l'effet d'ouverture, et dans chooseRoaming
    // — jamais dans la branche "poste lié en permanence" (bound).
    expect(page).toMatch(/setIsRoamingSession\(true\);/);
    const boundBranch = page.match(/if \(bound\) \{[\s\S]*?setIsRoamingSession\(false\);[\s\S]*?return;\s*\}/);
    expect(boundBranch).not.toBeNull();
  });

  it('affiche le nom de la boutique courante, ancré au bloc catalogue (pas plein écran)', () => {
    expect(page).toMatch(/\{roamingStoreName && \(/);
    expect(page).toContain('<span>{roamingStoreName}</span>');
    // Ancré au conteneur `relative` du catalogue (bas-gauche DE ce bloc), pas
    // `fixed` sur tout l'écran comme le badge de synchronisation voisin.
    expect(page).toMatch(/absolute bottom-3 left-3[^"]*/);
  });
});
