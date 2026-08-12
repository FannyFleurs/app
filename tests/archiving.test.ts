import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zeroStockRows } from '@/app/(app)/stock/StockAdmin';

/**
 * Archivage des fiches clients et des articles.
 *
 * Deux besoins de terrain : les doublons clients, qu'on ne peut pas supprimer
 * (leurs tickets et factures sont de l'historique fiscal), et les articles de
 * saison qui encombrent la caisse une fois écoulés. Dans les deux cas la même
 * règle : la fiche existe toujours, elle cesse simplement de remonter — et le
 * geste est réversible.
 */

const lire = (f: string) => readFileSync(f, 'utf8');

const ligne = (id: string, nom: string, qty: string, cat: string | null) => ({
  product_id: id, product_name: nom, product_sku: null,
  store_id: 's1', store_name: 'Boutique', quantity: qty,
  min_stock: null, max_stock: null, unit: 'unité',
  category_id: cat, category_name: cat ? `Cat ${cat}` : null,
});

const LIGNES = [
  ligne('a', 'Bouquet rond', '0.000', 'c1'),
  ligne('b', 'Monstera', '0', 'c2'),
  ligne('c', 'Orchidée', '7.000', 'c1'),
  ligne('d', 'Carte message', '0.000', null),
];

describe('Stock à 0', () => {
  it('ne retient que les lignes réellement à zéro', () => {
    expect(zeroStockRows(LIGNES, 'all').map((l) => l.product_name))
      .toEqual(['Bouquet rond', 'Monstera', 'Carte message']);
  });

  it('lit le zéro sur la quantité, quelle que soit son écriture', () => {
    // La colonne est un NUMERIC sérialisé : « 0 », « 0.000 »… même chose.
    expect(zeroStockRows([ligne('x', 'X', '0.0000', 'c1')], 'all')).toHaveLength(1);
    expect(zeroStockRows([ligne('x', 'X', '-2.000', 'c1')], 'all')).toHaveLength(0);
  });

  it('filtre par catégorie, sans catégorie comprise', () => {
    expect(zeroStockRows(LIGNES, 'c1').map((l) => l.product_name)).toEqual(['Bouquet rond']);
    expect(zeroStockRows(LIGNES, 'none').map((l) => l.product_name)).toEqual(['Carte message']);
  });
});

describe('Clients archivés', () => {
  it('sortent de toutes les recherches', () => {
    // Une seule oubliée et le doublon ressort là où on l'avait rangé.
    for (const f of [
      'app/api/customers/route.ts',
      'app/(app)/customers/page.tsx',
      'app/(app)/loyalty/page.tsx',
      'lib/services/monthly-billing.ts',
    ]) {
      expect(lire(f), f).toMatch(/archived_at IS NULL/);
    }
  });

  it('restent consultables à la demande', () => {
    const api = lire('app/api/customers/route.ts');
    expect(api).toMatch(/archived === 'only'/);
    expect(api).toMatch(/archived_at IS NOT NULL/);
  });

  it('se rangent et se ressortent par le même endpoint', () => {
    const route = lire('app/api/customers/[id]/archive/route.ts');
    expect(route).toMatch(/archived \? 'now\(\)' : 'NULL'/);
    expect(route).toContain("requirePermission('customers.write')");
  });

  it('ne servent plus de point d\'ancrage à l\'import', () => {
    // Réimporter un email archivé doit créer une fiche neuve, sinon la mise à
    // jour partirait dans une fiche invisible : l'import semblerait sans effet.
    expect(lire('app/api/customers/import/route.ts')).toMatch(/email = \$2[\s\S]{0,120}archived_at IS NULL/);
  });
});

describe('Articles archivés', () => {
  it('quittent la caisse et la valorisation du stock', () => {
    // `is_active = FALSE` est le drapeau historique du catalogue : la liste
    // caisse le filtre déjà, la valorisation du stock devait suivre.
    expect(lire('app/api/stock/levels/route.ts')).toMatch(/p\.is_active = TRUE/);
    expect(lire('app/api/products/route.ts')).toMatch(/onlyActive.*p\.is_active = TRUE/s);
  });

  it('reviennent visibles en caisse au désarchivage', () => {
    // visible_in_pos suit is_active : sans cela, un article désarchivé
    // resterait absent des tuiles et le bouton paraîtrait sans effet.
    const bulk = lire('app/api/products/bulk-archive/route.ts');
    expect(bulk).toMatch(/SET is_active = \$3, visible_in_pos = \$3/);
    expect(bulk).toContain("requirePermission('products.write')");
  });

  it('se commandent depuis la fiche par un bouton, pas par une case', () => {
    // Deux commandes pour un même effet (case « Actif » + bouton Archiver) se
    // contredisaient à la première hésitation.
    const fiche = lire('app/(app)/products/ProductFormModal.tsx');
    expect(fiche).toMatch(/'Archiver' : 'Désarchiver'|form\.is_active \? 'Archiver'/);
    expect(fiche).not.toContain('label="Actif"');
  });

  it('ont leur écran de retour dans la page Stock', () => {
    const stock = lire('app/(app)/stock/StockAdmin.tsx');
    expect(stock).toMatch(/label: 'Stock à 0'/);
    expect(stock).toMatch(/label: 'Produits archivés'/);
    expect(stock).toContain('/api/products/bulk-archive');
  });
});
