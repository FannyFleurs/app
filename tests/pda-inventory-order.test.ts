import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

/**
 * Le PDA compte, il ne clôture pas.
 *
 * Un comptage se fait rarement d'une traite : on passe en réserve, on revient
 * sur un rayon oublié. Le bouton fermait l'inventaire au premier envoi, sans
 * retour possible — et depuis la douchette, personne ne pouvait le rouvrir.
 */
describe('Comptage PDA — envoi sans clôture', () => {
  const src = readFileSync('app/pda/PdaInventory.tsx', 'utf8');

  it('envoie le comptage au lieu de clôturer', () => {
    expect(src).toContain("'Envoyer le comptage'");
    expect(src).not.toMatch(/Clôturer l['’]inventaire/);
  });

  it('ne bascule plus l\'inventaire en pointage', () => {
    // Le passage en pointage est irréversible : il doit rester déclenché
    // depuis la caisse ou le back-office, jamais depuis le PDA.
    expect(src).not.toMatch(/inventories\/\$\{[^}]+\}\/review/);
  });

  it('règle la quantité avec + / − et un champ, sans pavé numérique', () => {
    expect(src).toContain('QtyStepper');
    expect(src).not.toContain('QtyPad');
    const ui = readFileSync('app/pda/ui.tsx', 'utf8');
    expect(ui).toContain('aria-label="Retirer un"');
    expect(ui).toContain('aria-label="Ajouter un"');
    expect(ui).toContain('inputMode="numeric"');
  });
});
