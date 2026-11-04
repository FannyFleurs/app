import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchProductByCode, type PosProduct } from '@/app/(app)/caisse/CashRegister';

/**
 * Bug remonté en production : le scan direct d'un article (douchette USB,
 * aucun champ focalisé) n'ajoutait plus rien au panier — « rien ne se passe
 * du tout » —, alors que la recherche manuelle (ouvrir « Rechercher /
 * scanner », taper/scanner le même code, cliquer la tuile) retrouvait
 * toujours l'article correctement.
 *
 * Cause : le scan direct ET la touche Entrée dans le champ recherche
 * utilisent tous deux matchProductByCode, qui exigeait une égalité EXACTE
 * avec le barcode/SKU enregistré — alors que la recherche visible (filtre
 * du catalogue, voir visibleProducts dans CashRegister.tsx) utilise une
 * comparaison « contient », bien plus tolérante à un espace superflu, un
 * caractère invisible ou une variante de format selon le modèle de
 * douchette. matchProductByCode retombe désormais sur cette même
 * comparaison « contient » quand l'égalité stricte ne trouve rien — mais
 * UNIQUEMENT si elle désigne un seul article, pour ne jamais ajouter le
 * mauvais produit en cas d'ambiguïté.
 */
function product(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: overrides.id ?? 'p1',
    name: 'Bouquet de roses',
    sale_price_ttc: 29.9,
    price_is_free: false,
    tax_rate: 20,
    tax_rate_id: 'tr1',
    tax_rate_code: 'TVA20',
    category_id: null,
    category_name: null,
    category_color: null,
    barcode: null,
    sku: null,
    image_url: null,
    short_description: null,
    is_customizable: false,
    is_top_product: false,
    tags: [],
    ...overrides,
  };
}

describe('matchProductByCode — égalité exacte (comportement historique)', () => {
  it('trouve par barcode exact', () => {
    const p = product({ barcode: '3760123456789' });
    expect(matchProductByCode([p], '3760123456789')).toBe(p);
  });

  it('trouve par SKU exact, insensible à la casse', () => {
    const p = product({ sku: 'sap-80100-ja' });
    expect(matchProductByCode([p], 'SAP-80100-JA')).toBe(p);
  });

  it('trouve par code-barres additionnel (extra_barcodes)', () => {
    const p = product({ extra_barcodes: ['1111111111111', '2222222222222'] });
    expect(matchProductByCode([p], '2222222222222')).toBe(p);
  });

  it("renvoie undefined pour une chaîne vide (après trim)", () => {
    expect(matchProductByCode([product({ barcode: 'X' })], '   ')).toBeUndefined();
  });
});

describe('matchProductByCode — repli « contient » (correctif du bug de production)', () => {
  it("retrouve l'article quand le code SCANNÉ contient le barcode enregistré (caractère parasite en trop)", () => {
    // Reproduit : le scanner ajoute un caractère que le barcode stocké n'a
    // pas (espace, caractère de contrôle mal filtré, variante de format) —
    // l'égalité stricte échoue, mais le code scanné CONTIENT bien le
    // barcode réel.
    const p = product({ barcode: '3760123456789' });
    expect(matchProductByCode([p], 'x3760123456789')).toBe(p);
  });

  it('retrouve l\'article quand le SKU stocké CONTIENT le code scanné (scan partiel)', () => {
    const p = product({ sku: 'SAP-80100-JA' });
    expect(matchProductByCode([p], '80100')).toBe(p);
  });

  it("n'ajoute PAS automatiquement si le repli « contient » désigne PLUSIEURS articles (ambiguïté)", () => {
    const a = product({ id: 'a', sku: 'SAP-80100-JA' });
    const b = product({ id: 'b', sku: 'SAP-80100-BL' });
    expect(matchProductByCode([a, b], '80100')).toBeUndefined();
  });

  it('ne retrouve PAS un article via son seul nom (pas de faux positif scan/nom)', () => {
    const p = product({ name: '80100 Edition limitée', barcode: '111', sku: 'X' });
    expect(matchProductByCode([p], '80100')).toBeUndefined();
  });

  it("l'égalité exacte reste prioritaire sur le repli « contient »", () => {
    const exact = product({ id: 'exact', sku: 'ABC' });
    const loose = product({ id: 'loose', sku: 'ABCDEF' });
    expect(matchProductByCode([loose, exact], 'ABC')).toBe(exact);
  });

  it("un article sans barcode/SKU (null/vide) ne matche jamais via le repli « contient »", () => {
    const p = product({ barcode: null, sku: null });
    expect(matchProductByCode([p], 'nimporte-quoi')).toBeUndefined();
  });
});

describe('Listener global de scan — accepte tout caractère simple, pas une liste blanche', () => {
  // CashRegister.tsx est un très gros composant client (voir
  // caisse-loyalty-editable-amount.test.ts pour le même choix) : on
  // vérifie la condition exacte sur la source plutôt qu'un rendu complet.
  const src = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it("le buffer du scanner global n'utilise plus de liste blanche de caractères (e.key.length === 1 seul)", () => {
    // Avant correctif : /^[0-9a-zA-Z\-._/]$/.test(e.key) en plus de la
    // longueur — un caractère du code-barres/SKU hors de cette liste
    // (espace, accent, caractère selon la disposition clavier configurée
    // sur la douchette) était silencieusement perdu, et le code reconstruit
    // ne correspondait alors plus jamais à l'article, même approximativement.
    expect(src).not.toMatch(/e\.key\.length === 1 && \/\^\[0-9a-zA-Z/);
    expect(src).toMatch(/if \(e\.key\.length === 1\) \{\s*buf\.push\(\{ key: e\.key, t: now \}\);/);
  });
});
