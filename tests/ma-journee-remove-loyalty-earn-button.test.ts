import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * « Retirer points acquis » (Ma journée) : l'inverse de « Retirer avantage
 * fid » — bouton visible uniquement quand loyalty.earnRemovable est vrai,
 * indépendant du bouton existant (earned/removed, pas redeemed/removable).
 *
 * MaJourneeClient.tsx est un très gros composant client, sans rendu complet
 * en test (voir tests/ma-journee.test.ts pour le même choix) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('Ma journée — bouton « Retirer points acquis »', () => {
  const page = readFileSync('app/(app)/ma-journee/MaJourneeClient.tsx', 'utf8');

  it('le bouton est conditionné à detail.loyalty?.earnRemovable', () => {
    expect(page).toMatch(/s\.status === 'validated' && detail\.loyalty\?\.earnRemovable && \(/);
    expect(page).toMatch(/Retirer points acquis/);
  });

  it('appelle POST \/api\/sales\/\\{id\\}\/remove-loyalty-earn', () => {
    expect(page).toMatch(/fetch\(`\/api\/sales\/\$\{s\.id\}\/remove-loyalty-earn`, \{ method: 'POST' \}\)/);
  });

  it('demande confirmation avant de retirer', () => {
    expect(page).toMatch(/async function removeLoyaltyEarn\(\)/);
    expect(page).toMatch(/title: 'Retirer les points acquis'/);
  });
});
