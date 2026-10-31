import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Champ « Rechercher / scanner » en caisse : auparavant replié par défaut
 * (une barre cliquable à ouvrir avant de pouvoir saisir). Il est maintenant
 * TOUJOURS un champ de saisie actif, avec autofocus au montage — on peut
 * taper ou scanner immédiatement, sans jamais avoir à cliquer dessus.
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (même choix que pour les autres fonctionnalités de ce fichier) : on
 * vérifie la présence et la condition exacte sur la source.
 */
describe('Caisse — recherche toujours active (autofocus)', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('le champ recherche est rendu directement, sans état replié (plus de searchOpen)', () => {
    expect(page).not.toMatch(/searchOpen/);
    expect(page).toMatch(/<input\s+ref=\{searchRef\}\s+autoFocus/);
  });

  it('le raccourci « \/ » focalise directement le champ, sans passer par un état d\'ouverture', () => {
    expect(page).toMatch(/if \(e\.key === '\/' && document\.activeElement !== searchRef\.current\) \{\s*e\.preventDefault\(\);\s*searchRef\.current\?\.focus\(\);/);
  });

  it('Échap vide la recherche sans masquer le champ', () => {
    expect(page).toMatch(/if \(e\.key === 'Escape'\) \{ setSearch\(''\); return; \}/);
  });
});
