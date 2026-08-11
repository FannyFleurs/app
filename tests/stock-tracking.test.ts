import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STOCK_TRACKED_SQL } from '@/lib/services/stock-tracking';

/**
 * « Gérer le stock » : un choix explicite, article par article.
 *
 * La caisse décidait seule auparavant — un article était décompté s'il avait un
 * code-barres et n'était pas dans la catégorie « Livraison ». Règle invisible
 * depuis la fiche, donc impossible à contredire. C'est désormais la case de la
 * fiche article qui commande, et une seule constante la porte : vente, retour
 * et annulation doivent rester d'accord, sinon un article serait décompté à la
 * vente sans être recrédité au retour.
 */

const migration = readFileSync('migrations/0066_track_stock_explicit.sql', 'utf8');

describe('Suivi du stock', () => {
  it('repose sur la case de la fiche, pas sur une heuristique', () => {
    expect(STOCK_TRACKED_SQL).toBe('p.track_stock');
    // Les anciens critères ne doivent plus intervenir dans la décision.
    expect(STOCK_TRACKED_SQL).not.toMatch(/barcode|livraison/i);
  });

  it('est lu par la vente, le retour et l\'annulation', () => {
    for (const f of [
      'lib/services/sale-service.ts',
      'lib/services/return-service.ts',
      'lib/services/sale-cancel-service.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('STOCK_TRACKED_SQL');
      // Aucun service ne doit refaire son propre test à côté.
      expect(src, f).not.toMatch(/p\.barcode IS NOT NULL AND/);
    }
  });

  it('reprend l\'existant sans changer le comportement d\'un article', () => {
    // Au déploiement, les articles que la caisse décomptait déjà doivent
    // continuer de l'être : sinon le stock cesserait de bouger du jour au
    // lendemain, sans que personne n'ait rien décoché.
    expect(migration).toMatch(/SET track_stock = TRUE/);
    expect(migration).toMatch(/barcode IS NOT NULL/);
    expect(migration).toMatch(/<> 'livraison'/);
    // Et ceux qui portent déjà une quantité saisie, même sans code-barres.
    expect(migration).toMatch(/stock_levels[\s\S]{0,120}quantity <> 0/);
  });

  it('propose la case sur la fiche article', () => {
    const form = readFileSync('app/(app)/products/ProductFormModal.tsx', 'utf8');
    expect(form).toContain('label="Gérer le stock"');
    expect(form).toMatch(/track_stock: form\.track_stock/);
    // La liste doit renvoyer la colonne, sinon la case s'ouvre toujours vide.
    expect(readFileSync('app/api/products/route.ts', 'utf8')).toMatch(/p\.track_stock,/);
  });
});
