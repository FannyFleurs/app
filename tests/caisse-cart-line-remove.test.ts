import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ligne de panier : le bouton retirer (croix) passe d'une petite croix en
 * coin de tuile à un bouton rouge pleine hauteur sur la droite de la ligne.
 * On peut aussi retirer l'article en glissant la ligne vers la gauche
 * (tablette/mobile), même geste et mêmes seuils que le swipe
 * catalogue/panier déjà existant.
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet
 * en test (même choix que pour les autres gros composants de ce projet,
 * voir caisse-loyalty-editable-amount.test.ts) : on vérifie la présence et
 * le câblage exact sur la source.
 */
describe('Caisse — ligne de panier : retrait pleine hauteur + glissement', () => {
  const src = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('le bouton retirer est rouge (bg-danger), pleine hauteur, sur la droite de la ligne', () => {
    expect(src).toMatch(/className="w-11 shrink-0 grid place-items-center bg-danger text-white[^"]*"\s*\n\s*aria-label="Retirer cet article"/);
  });

  it("la ligne (bouton remise + bouton retirer) est un conteneur flex pleine hauteur, pas un seul <button>", () => {
    expect(src).toMatch(/className="flex items-stretch rounded-lg border border-accent-soft-line overflow-hidden"/);
  });

  it('glisser la ligne vers la gauche retire aussi l\'article (onLineTouchStart/onLineTouchEnd câblés sur la ligne)', () => {
    expect(src).toMatch(/onTouchStart=\{onLineTouchStart\}/);
    expect(src).toMatch(/onTouchEnd=\{\(e\) => onLineTouchEnd\(e, l\.key\)\}/);
  });

  it('onLineTouchEnd retire la ligne au-delà du même seuil que le swipe catalogue/panier (dx < -60)', () => {
    const idx = src.indexOf('function onLineTouchEnd');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/if \(Math\.abs\(dy\) > 60\) return;/);
    expect(block).toMatch(/if \(Date\.now\(\) - start\.t > 600\) return;/);
    expect(block).toMatch(/if \(dx < -60\) removeLine\(key\);/);
  });
});
