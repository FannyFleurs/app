import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Déconnexion rapide au clavier : Espace + Entrée (l'une tenue, l'autre
 * pressée, dans n'importe quel ordre) — se déconnecter sans toucher
 * l'écran. Actif partout (caisse + back-office), sauf pendant une saisie
 * de texte (champ focalisé).
 *
 * En CAPTURE sur window, et non en phase par défaut (bubble) : le scanner
 * de code-barres de la caisse (CashRegister.tsx) écoute en capture sur
 * document et avale chaque caractère seul tapé hors d'un champ. window
 * précède document dans la phase de capture, donc ce raccourci voit
 * l'événement en premier, qu'il soit ensuite avalé ou non.
 *
 * Touche choisie : Espace, PAS un chiffre. Un chiffre (« 0 », essayé puis
 * abandonné le 31/10) apparaît dans la quasi-totalité des codes-barres
 * numériques (EAN/UPC) — si son keyup n'est pas encore traité quand le
 * scanner envoie l'Entrée de fin de scan, le raccourci se déclenche à tort
 * et déconnecte silencieusement l'utilisateur EN PLEIN SCAN (l'article
 * scanné ne s'ajoute alors jamais au panier, sans erreur visible — bug
 * remonté en production). Espace n'apparaît jamais dans l'ensemble de
 * caractères qu'un scan peut produire : aucun risque de collision.
 *
 * AppShell.tsx est un composant client sans rendu complet en test (même
 * choix que pour les autres gros composants de ce projet) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('AppShell — raccourci clavier de déconnexion (Espace + Entrée)', () => {
  const page = readFileSync('components/AppShell.tsx', 'utf8');

  it('écoute keydown/keyup en CAPTURE sur window, sans dépendre de backOffice', () => {
    const idx = page.indexOf('// Déconnexion rapide au clavier');
    expect(idx).toBeGreaterThan(-1);
    const block = page.slice(idx, idx + 2600);
    expect(block).not.toMatch(/if \(backOffice\) return;/);
    expect(block).toMatch(/window\.addEventListener\('keydown', onKeyDown, true\);/);
    expect(block).toMatch(/window\.addEventListener\('keyup', onKeyUp, true\);/);
  });

  it('ignore la combinaison pendant une saisie de texte (champ focalisé)', () => {
    expect(page).toMatch(/if \(inField\(e\)\) return;/);
    expect(page).toMatch(/t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA' \|\| t\.tagName === 'SELECT' \|\| t\.isContentEditable/);
  });

  it('déclenche logout() quand l\'autre touche (Espace / Entrée) est déjà tenue, dans les deux sens', () => {
    expect(page).toMatch(/if \(e\.key !== ' ' && e\.key !== 'Enter'\) return;/);
    expect(page).toMatch(/const other = e\.key === ' ' \? 'Enter' : ' ';/);
    expect(page).toMatch(/if \(held\.has\(other\) && !fired\) \{\s*fired = true;\s*e\.preventDefault\(\);\s*void logout\(\);/);
  });

  it('ne se redéclenche pas tant que les deux touches ne sont pas relâchées', () => {
    expect(page).toMatch(/if \(held\.size === 0\) fired = false;/);
  });

  it("n'utilise PAS un chiffre comme touche du raccourci (collision avec les codes-barres numériques)", () => {
    const idx = page.indexOf('// Déconnexion rapide au clavier');
    const block = page.slice(idx, idx + 2600);
    expect(block).not.toMatch(/e\.key !== '0'/);
    expect(block).not.toMatch(/e\.key === '0'/);
  });
});
