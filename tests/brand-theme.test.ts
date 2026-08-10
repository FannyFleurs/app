import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  POS_THEME_COLORS, POS_THEME_COLOR_VALUES, POS_UI_DEFAULTS,
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
    const root = css.slice(css.indexOf(':root {'), css.indexOf('body[data-mode="dark"]'));
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
});
