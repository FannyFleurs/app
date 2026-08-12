import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BRAND_THEME, POS_THEME_COLORS, POS_THEME_COLOR_VALUES, POS_UI_DEFAULTS,
} from '@/lib/settings/pos-ui';

/**
 * Couleurs de la marque HelloPos : vert profond #013E37, jaune doux #FFEFB3.
 *
 * Elles vivent à trois endroits qui doivent rester d'accord — les variables
 * CSS de `:root`, le thème sélectionnable, et les neutres de Tailwind. Une
 * seule qui dérive, et l'écran se retrouve avec deux verts légèrement
 * différents côte à côte.
 */

const VERT = '#013E37';
const JAUNE = '#FFEFB3';

const css = readFileSync('app/globals.css', 'utf8');
const tw = readFileSync('tailwind.config.ts', 'utf8');

describe('Palette de marque', () => {
  it('est le thème par défaut', () => {
    expect(POS_UI_DEFAULTS.theme_color).toBe('hellopos');
    expect(POS_THEME_COLORS[0]).toBe('hellopos');
  });

  it('porte les deux couleurs demandées', () => {
    const t = POS_THEME_COLOR_VALUES.hellopos;
    expect(t.main.toUpperCase()).toBe(VERT);
    expect(t.soft.toUpperCase()).toBe(JAUNE);
  });

  it('donne les mêmes valeurs aux variables CSS de base', () => {
    // `:root` sert quand aucun thème n'est encore appliqué (premier rendu,
    // pages hors application). Il ne doit pas montrer une autre couleur.
    const root = css.slice(css.indexOf(':root {'), css.indexOf('@keyframes fadeIn'));
    expect(root).toMatch(/--primary:\s*#013E37/i);
    expect(root).toMatch(/--primary-soft:\s*#FFEFB3/i);
    expect(root).toMatch(/--topbar-bg:\s*#013E37/i);
  });

  it('accorde les neutres de Tailwind avec ceux du CSS', () => {
    // Tailwind garde des valeurs en dur (les variantes d'opacité ne savent pas
    // décomposer une variable CSS) : c'est justement ce qui peut diverger.
    for (const [nomCss, valeur] of [
      ['--bg', '#F8F6F0'],
      ['--border', '#E7E3D8'],
      ['--ink', '#14211D'],
      ['--ink-soft', '#5A625E'],
    ] as const) {
      expect(css).toMatch(new RegExp(`${nomCss}:\\s*${valeur}`, 'i'));
      expect(tw.toUpperCase()).toContain(valeur);
    }
  });

  it('s\'applique partout, sans réglage possible', () => {
    // L'habillage était réglable par poste : deux caisses côte à côte pouvaient
    // afficher deux verts différents, et chaque écran ajouté demandait d'être
    // vérifié en clair ET en sombre. Il n'y a plus qu'un thème, clair.
    expect(BRAND_THEME).toBe('hellopos');
    const shell = readFileSync('components/AppShell.tsx', 'utf8');
    expect(shell).toMatch(/const appliedTheme = BRAND_THEME;/);
    // Plus aucun code ne repose le mode d'après une préférence.
    expect(shell).not.toMatch(/prefers-color-scheme/);
  });

  it('ne garde aucune trace du mode sombre', () => {
    // Le mode sombre a été retiré de l'interface, mais son habillage est resté
    // dans la feuille de style : une centaine de lignes que plus aucun
    // sélecteur ne pouvait atteindre, puisque `data-mode` ne valait plus que
    // « light ». Du CSS mort donne une fausse idée de ce que fait la page — on
    // vérifie donc qu'il ne revient pas.
    expect(css).not.toMatch(/data-mode/);
    expect(css).not.toMatch(/prefers-color-scheme/);
    const shell = readFileSync('components/AppShell.tsx', 'utf8');
    expect(shell).not.toMatch(/setAttribute\('data-mode'/);
  });

  it('ne propose plus de personnalisation dans les réglages', () => {
    const reglages = readFileSync('app/(app)/pos-settings/POSSettingsForm.tsx', 'utf8');
    expect(reglages).not.toMatch(/Mode d'affichage/);
    expect(reglages).not.toMatch(/Couleur des boutons/);
    expect(reglages).not.toMatch(/POS_THEME_COLORS/);
  });
});
