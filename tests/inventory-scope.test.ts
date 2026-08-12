import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { produitDansBoutique } from '@/lib/services/inventory-scope';

/**
 * Un inventaire appartient à UNE boutique.
 *
 * La création par catégorie proposait les catégories de toute l'organisation,
 * et le pré-remplissage prenait tous les articles : à Mortagne on se voyait
 * proposer les catégories d'Alençon, et les cocher ne produisait que des
 * lignes à zéro — des écarts inventés, à justifier un par un.
 */

describe('Périmètre boutique', () => {
  const sql = produitDansBoutique('$2');

  it('retient le partagé, le rattaché, et ce qui a du stock ici', () => {
    // Trois portes, et pas une de moins : un article sans rattachement est
    // vendu partout ; un article rattaché ailleurs mais présent en rayon doit
    // quand même être compté.
    expect(sql).toMatch(/array_length\(p\.store_ids, 1\), 0\) = 0/);
    expect(sql).toMatch(/p\.store_ids @> ARRAY\[\$2\]::uuid\[\]/);
    expect(sql).toMatch(/stock_levels sl[\s\S]*sl\.store_id = \$2/);
  });

  it('porte le placeholder qu\'on lui donne', () => {
    // Le fragment est inséré dans deux requêtes où la boutique n'occupe pas
    // forcément la même position.
    expect(produitDansBoutique('$3')).toContain('ARRAY[$3]::uuid[]');
    expect(produitDansBoutique('$3')).not.toContain('$2');
  });
});

describe('Création d\'inventaire', () => {
  const route = readFileSync('app/api/inventories/route.ts', 'utf8');
  const scopes = readFileSync('app/api/inventories/scopes/route.ts', 'utf8');
  const form = readFileSync('app/(app)/inventory/new/InventoryNewForm.tsx', 'utf8');

  it('propose et compte selon le MÊME critère', () => {
    // Deux définitions divergentes donneraient une catégorie proposée puis un
    // inventaire vide.
    expect(scopes).toContain('produitDansBoutique');
    expect(route).toContain('produitDansBoutique');
  });

  it('recharge les portées quand la boutique change', () => {
    expect(form).toMatch(/\/api\/inventories\/scopes\?store_id=/);
    expect(form).toMatch(/\}, \[storeId\]\);/);
    // Et remet la sélection à zéro : garder une catégorie de l'autre boutique
    // créerait des lignes vides.
    expect(form).toMatch(/setSelected\(new Set\(\)\);[\s\S]{0,200}inventories\/scopes/);
  });

  it('refuse une session sans rien à compter', () => {
    expect(route).toContain('EMPTY_SCOPE');
    expect(route).toMatch(/COUNT\(\*\)::text AS n FROM inventory_lines/);
  });

  it('ne charge plus les catégories de l\'organisation au rendu', () => {
    // La page serveur les envoyait toutes, figées : le sélecteur de boutique
    // ne pouvait rien y changer.
    const page = readFileSync('app/(app)/inventory/new/page.tsx', 'utf8');
    expect(page).not.toMatch(/FROM product_categories/);
  });
});

describe('Liste des inventaires', () => {
  it('se lit boutique par boutique', () => {
    expect(readFileSync('app/api/inventories/route.ts', 'utf8'))
      .toMatch(/\$2::uuid IS NULL OR i\.store_id = \$2/);
    expect(readFileSync('app/(app)/inventory/InventoryList.tsx', 'utf8'))
      .toMatch(/\/api\/inventories\?store_id=/);
  });
});
