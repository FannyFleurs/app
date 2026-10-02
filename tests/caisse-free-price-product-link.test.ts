import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Article "prix libre" (products.price_is_free, ex. un bouquet dont le prix
 * varie) vendu en caisse : la ligne doit garder le lien vers l'article
 * (product_id), pas seulement son libellé — sinon sa famille et le taux de
 * TVA de sa fiche se perdent, et la ligne atterrit "Sans famille" dans les
 * exports comme une vente totalement anonyme (symptôme remonté en
 * production : un article catégorisé "Deuil" ressortait sans famille après
 * une vente "prix libre").
 *
 * Distinction à préserver : le raccourci F2 (montant libre SANS article,
 * setShowFreePrice({})) doit, lui, continuer à créer une ligne product_id
 * null — ce n'est pas un article du catalogue.
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (voir tests/ma-journee.test.ts pour le même choix) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('Caisse — article "prix libre" garde son lien produit', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('addProduct transmet productId et taxRateCode au déclenchement de la saisie prix libre', () => {
    expect(page).toMatch(
      /setShowFreePrice\(\{ label: p\.name, productId: p\.id, taxRateCode: p\.tax_rate_code \}\);/,
    );
  });

  it('le raccourci montant libre (F2, sans article) reste sans productId', () => {
    expect(page).toMatch(/setShowFreePrice\(\{\}\)/);
  });

  it('addFreeBouquet pose product_id depuis showFreePrice, pas null en dur', () => {
    expect(page).toMatch(/product_id: showFreePrice\?\.productId \?\? null, variant_id: null,/);
    // L'ancien code (`product_id: null,` en dur) ne doit plus exister pour
    // cette ligne précise.
    expect(page).not.toMatch(/product_id: null, variant_id: null,\s*\n\s*label, unit_price_ttc: amount/);
  });

  it('le taux de TVA par défaut de la modale priorise celui DE LA FICHE ARTICLE sur celui de la boutique', () => {
    expect(page).toMatch(/showFreePrice\.taxRateCode && taxRates\.some\(\(t\) => t\.code === showFreePrice\.taxRateCode\)/);
  });
});
