import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Déconnexion rapide au clavier : 0 + Entrée (l'une tenue, l'autre pressée,
 * dans n'importe quel ordre) — se déconnecter sans toucher l'écran. Actif
 * partout (caisse + back-office), sauf pendant une saisie de texte (champ
 * focalisé).
 *
 * En CAPTURE sur window, et non en phase par défaut (bubble) : le scanner
 * de code-barres de la caisse (CashRegister.tsx) écoute en capture sur
 * document et avale chaque caractère seul tapé hors d'un champ — y compris
 * « 0 » (preventDefault + stopPropagation). window précède document dans la
 * phase de capture, donc ce raccourci doit s'y accrocher pour voir le « 0 »
 * AVANT que le scanner ne l'avale, sans quoi il resterait muet sur l'écran
 * de caisse (c'était le cas avec Espace, remplacé par 0).
 *
 * AppShell.tsx est un composant client sans rendu complet en test (même
 * choix que pour les autres gros composants de ce projet) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('AppShell — raccourci clavier de déconnexion (0 + Entrée)', () => {
  const page = readFileSync('components/AppShell.tsx', 'utf8');

  it('écoute keydown/keyup en CAPTURE sur window, sans dépendre de backOffice', () => {
    const idx = page.indexOf('// Déconnexion rapide au clavier');
    expect(idx).toBeGreaterThan(-1);
    const block = page.slice(idx, idx + 1800);
    expect(block).not.toMatch(/if \(backOffice\) return;/);
    expect(block).toMatch(/window\.addEventListener\('keydown', onKeyDown, true\);/);
    expect(block).toMatch(/window\.addEventListener\('keyup', onKeyUp, true\);/);
  });

  it('ignore la combinaison pendant une saisie de texte (champ focalisé)', () => {
    expect(page).toMatch(/if \(inField\(e\)\) return;/);
    expect(page).toMatch(/t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA' \|\| t\.tagName === 'SELECT' \|\| t\.isContentEditable/);
  });

  it('déclenche logout() quand l\'autre touche (0 / Entrée) est déjà tenue, dans les deux sens', () => {
    expect(page).toMatch(/if \(e\.key !== '0' && e\.key !== 'Enter'\) return;/);
    expect(page).toMatch(/const other = e\.key === '0' \? 'Enter' : '0';/);
    expect(page).toMatch(/if \(held\.has\(other\) && !fired\) \{\s*fired = true;\s*e\.preventDefault\(\);\s*void logout\(\);/);
  });

  it('ne se redéclenche pas tant que les deux touches ne sont pas relâchées', () => {
    expect(page).toMatch(/if \(held\.size === 0\) fired = false;/);
  });
});
