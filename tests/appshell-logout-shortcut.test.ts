import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Déconnexion rapide au clavier : Espace + Entrée (l'une tenue, l'autre
 * pressée, dans n'importe quel ordre) — se déconnecter sans toucher
 * l'écran. Actif partout (caisse + back-office), sauf pendant une saisie
 * de texte (champ focalisé).
 *
 * AppShell.tsx est un composant client sans rendu complet en test (même
 * choix que pour les autres gros composants de ce projet) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('AppShell — raccourci clavier de déconnexion (Espace + Entrée)', () => {
  const page = readFileSync('components/AppShell.tsx', 'utf8');

  it('écoute keydown/keyup globalement, sans dépendre de backOffice', () => {
    const idx = page.indexOf('// Déconnexion rapide au clavier');
    expect(idx).toBeGreaterThan(-1);
    const block = page.slice(idx, idx + 1500);
    expect(block).not.toMatch(/if \(backOffice\) return;/);
    expect(block).toMatch(/window\.addEventListener\('keydown', onKeyDown\);/);
    expect(block).toMatch(/window\.addEventListener\('keyup', onKeyUp\);/);
  });

  it('ignore la combinaison pendant une saisie de texte (champ focalisé)', () => {
    expect(page).toMatch(/if \(inField\(e\)\) return;/);
    expect(page).toMatch(/t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA' \|\| t\.tagName === 'SELECT' \|\| t\.isContentEditable/);
  });

  it('déclenche logout() quand l\'autre touche est déjà tenue, dans les deux sens', () => {
    expect(page).toMatch(/const other = e\.key === ' ' \? 'Enter' : ' ';/);
    expect(page).toMatch(/if \(held\.has\(other\) && !fired\) \{\s*fired = true;\s*e\.preventDefault\(\);\s*void logout\(\);/);
  });

  it('ne se redéclenche pas tant que les deux touches ne sont pas relâchées', () => {
    expect(page).toMatch(/if \(held\.size === 0\) fired = false;/);
  });
});
