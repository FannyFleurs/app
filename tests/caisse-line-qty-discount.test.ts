import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Bug remonté en production : pour un client avec une remise systématique,
 * ajouter l'article au panier applique bien la remise (quantité 1), mais
 * augmenter la quantité via les boutons +/- de la ligne de panier (incLine)
 * ne la recalculait pas — la remise restait figée au montant valable pour
 * quantité 1, alors que re-scanner le même article (addProduct) la
 * recalculait correctement.
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (même choix que pour les autres gros composants de ce projet, voir
 * caisse-loyalty-editable-amount.test.ts) : on vérifie le câblage exact sur
 * la source.
 */
describe('Caisse — la remise automatique suit la quantité ajustée via +/- (incLine)', () => {
  const src = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');
  const idx = src.indexOf('function incLine');
  const block = src.slice(idx, idx + 1200);

  it('incLine existe et traite la ligne concernée', () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it('recalcule discount_amount à partir de la remise client (auto_discount_pct) et de la remise produit (product_disc_unit) à la nouvelle quantité', () => {
    expect(block).toMatch(/const autoPct = Number\(l\.metadata\?\.auto_discount_pct \?\? 0\);/);
    expect(block).toMatch(/const prodDiscUnit = Number\(l\.metadata\?\.product_disc_unit \?\? 0\);/);
    expect(block).toMatch(/round2\(round2\(\(l\.unit_price_ttc \* quantity \* autoPct\) \/ 100\) \+ round2\(prodDiscUnit \* quantity\)\)/);
  });

  it('ne recalcule jamais une remise manuelle (ligne justifiée ou part d\'une remise globale panier) : son montant reste celui choisi par la caissière', () => {
    expect(block).toMatch(/if \(l\.metadata\?\.manual_discount_reason \|\| l\.metadata\?\.cart_discount\) \{\s*return \{ \.\.\.l, quantity \};\s*\}/);
  });

  it('une ligne sans remise automatique garde son discount_amount inchangé (pas de remise à inventer)', () => {
    expect(block).toMatch(/if \(autoPct <= 0 && prodDiscUnit <= 0\) return \{ \.\.\.l, quantity \};/);
  });
});
