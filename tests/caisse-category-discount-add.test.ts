import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Remise automatique de catégorie (page Catégories, par boutique — voir
 * category_discounts / migration 0102) : résolue côté serveur par
 * /api/products (active aujourd'hui, pour la boutique demandée) et appliquée
 * au scan/à l'ajout dans addProduct, cumulable avec la remise client
 * (auto_discount_pct) et la remise propre à l'article (product_disc_unit).
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (même choix que pour les autres gros composants de ce projet) : on
 * vérifie le câblage exact sur la source, comme caisse-line-qty-discount.test.ts
 * le fait pour incLine.
 */
describe('Caisse — la remise automatique de catégorie s\'applique au scan (addProduct)', () => {
  const src = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');
  const idx = src.indexOf('const addProduct = useCallback');
  const block = src.slice(idx, idx + 3200);

  it('addProduct existe', () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it('calcule catDiscUnit à partir de category_discount_type/category_discount_value, comme prodDiscUnit', () => {
    expect(block).toMatch(/let catDiscUnit = 0;/);
    expect(block).toMatch(/if \(p\.category_discount_type && p\.category_discount_value && p\.category_discount_value > 0\)/);
  });

  it('cumule catDiscUnit avec prodDiscUnit dans le montant de la ligne', () => {
    expect(block).toMatch(/round2\(round2\(\(p\.sale_price_ttc \* qty \* autoPct\) \/ 100\) \+ round2\(\(prodDiscUnit \+ catDiscUnit\) \* qty\)\)/);
  });

  it('distingue les lignes existantes par catDiscUnit (pas de fusion d\'un article remisé avec un article à prix plein)', () => {
    expect(block).toMatch(/\(l\.metadata\?\.category_disc_unit \?\? 0\) === catDiscUnit/);
  });

  it('trace category_disc_unit dans les métadonnées de la ligne quand la remise est non nulle', () => {
    expect(block).toMatch(/\.\.\.\(catDiscUnit > 0 \? \{ category_disc_unit: catDiscUnit \} : \{\}\)/);
  });
});
