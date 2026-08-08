import { describe, it, expect } from 'vitest';
import { hoistCounted, type Line } from '@/app/pda/PdaInventory';

/**
 * Ordre de la liste de comptage sur le PDA.
 *
 * Le dernier article scanné doit être le premier affiché : c'est celui que
 * l'opérateur vérifie du regard juste après avoir bipé. Mis à jour à sa place
 * dans la liste, il restait à son rang alphabétique — souvent hors écran, donc
 * incontrôlable sans faire défiler.
 */

const ligne = (id: string, nom: string, qty = '0'): Line => ({
  id, product_id: id, product_name: nom, sku: null, barcode: null, counted_qty: qty,
});

const LISTE = [ligne('a', 'Anthurium'), ligne('b', 'Bougie'), ligne('c', 'Cache-pot')];

describe('Comptage PDA — ordre de la liste', () => {
  it('remonte en tête l\'article compté', () => {
    const r = hoistCounted(LISTE, 'c', '1');
    expect(r.map((l) => l.product_name)).toEqual(['Cache-pot', 'Anthurium', 'Bougie']);
    expect(r[0]!.counted_qty).toBe('1');
  });

  it('garde l\'ordre relatif des autres', () => {
    // Le reste de la liste ne doit pas être brassé : on s'y repère.
    expect(hoistCounted(LISTE, 'b', '2').map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });

  it('laisse la liste intacte si la ligne n\'existe pas', () => {
    expect(hoistCounted(LISTE, 'inconnu', '5')).toBe(LISTE);
  });

  it('ne duplique pas une ligne rescannée', () => {
    // Cinq scans du même article : une seule ligne, en tête, à la bonne
    // quantité — c'est le cas courant d'un carton que l'on égrène.
    let l = LISTE;
    for (const q of ['1', '2', '3', '4', '5']) l = hoistCounted(l, 'a', q);
    expect(l).toHaveLength(3);
    expect(l[0]).toMatchObject({ id: 'a', counted_qty: '5' });
  });

  it('ne modifie pas la liste d\'origine', () => {
    const avant = JSON.stringify(LISTE);
    hoistCounted(LISTE, 'a', '9');
    expect(JSON.stringify(LISTE)).toBe(avant);
  });
});
