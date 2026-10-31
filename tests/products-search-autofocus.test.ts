import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Page Produits (back-office) : le champ « Rechercher » était déjà un champ
 * de saisie réel (pas de bascule bouton ↔ champ comme l'ancienne barre de
 * caisse), mais sans autofocus — il fallait cliquer dessus avant de pouvoir
 * taper. Autofocus ajouté pour pouvoir chercher dès l'arrivée sur la page.
 */
describe('Page Produits — autofocus du champ recherche', () => {
  const page = readFileSync('app/(app)/products/ProductsList.tsx', 'utf8');

  it('le champ recherche a autoFocus', () => {
    expect(page).toMatch(/<input\s+autoFocus\s+className="input flex-1"\s+placeholder="Rechercher \(nom, SKU, code-barres\)…"/);
  });
});
