import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { choisirImprimante } from '@/lib/services/cloudprnt/printer-choice';

/**
 * Une imprimante appartient à une boutique.
 *
 * La résolution finissait par « sinon la première imprimante active de
 * l'organisation ». Avec une seule imprimante déclarée — celle de Mortagne —,
 * clôturer Alençon envoyait son rapport Z à Mortagne : le fond de caisse, le
 * détail des encaissements et le hash fiscal d'un magasin, sortis dans un
 * autre. Personne ne le voit passer, sauf celui qui ramasse le ticket.
 *
 * Ces tests interdisent le retour de ce repli.
 */

const ALENCON = 'a0000000-0000-0000-0000-000000000001';
const MORTAGNE = 'b0000000-0000-0000-0000-000000000002';

const pAlencon = { id: 'p-alencon', store_id: ALENCON };
const pMortagne = { id: 'p-mortagne', store_id: MORTAGNE };
const pOrga = { id: 'p-orga', store_id: null };

describe('Boutique connue', () => {
  it('prend l\'imprimante de cette boutique', () => {
    expect(choisirImprimante([pMortagne, pAlencon], ALENCON)).toBe(pAlencon);
  });

  it('n\'imprime JAMAIS chez une autre boutique', () => {
    // Le cas signalé : Mortagne est la seule enregistrée, on clôture Alençon.
    expect(choisirImprimante([pMortagne], ALENCON)).toBeNull();
    expect(choisirImprimante([pMortagne, pMortagne], ALENCON)).toBeNull();
  });

  it('accepte une imprimante déclarée sans boutique', () => {
    // store_id NULL est un choix explicite : « celle-ci sert tout le monde ».
    expect(choisirImprimante([pOrga], ALENCON)).toBe(pOrga);
  });

  it('préfère celle de la boutique à celle de l\'organisation', () => {
    expect(choisirImprimante([pOrga, pAlencon], ALENCON)).toBe(pAlencon);
  });
});

describe('Boutique inconnue', () => {
  it('prend celle de l\'organisation si elle existe', () => {
    expect(choisirImprimante([pAlencon, pOrga], null)).toBe(pOrga);
  });

  it('prend l\'unique imprimante quand il n\'y en a qu\'une', () => {
    expect(choisirImprimante([pAlencon], null)).toBe(pAlencon);
  });

  it('ne devine pas entre plusieurs boutiques', () => {
    // Se tromper de magasin coûte plus cher que de ne rien sortir.
    expect(choisirImprimante([pAlencon, pMortagne], null)).toBeNull();
  });
});

describe('Aucune imprimante', () => {
  it('ne trouve rien, quelle que soit la boutique', () => {
    expect(choisirImprimante([], ALENCON)).toBeNull();
    expect(choisirImprimante([], null)).toBeNull();
  });
});

describe('Clôture : chaque caisse ne voit que sa journée', () => {
  const route = readFileSync('app/api/closures/daily/today/route.ts', 'utf8');

  it('filtre les clôtures sur la boutique', () => {
    // La requête agrégeait MAX(sealed_at) sur toute l'organisation : clôturer
    // Alençon affichait « Journée clôturée » sur la caisse de Mortagne, et y
    // remplaçait le bouton « Clôturer la journée ».
    expect(route).toMatch(/WHERE organization_id = \$1 AND store_id = \$2/);
    expect(route).not.toMatch(/WHERE organization_id = \$1 AND business_date/);
  });

  it('résout la boutique du poste comme le rapport X', () => {
    // Les deux doivent parler de la même boutique sur le même écran.
    expect(route).toMatch(/resolveDeviceStoreId/);
    expect(route).toMatch(/storeInOrg/);
  });

  it('ne prétend pas clôturé quand aucune boutique n\'est résolue', () => {
    expect(route).toMatch(/if \(!storeId\) return NextResponse\.json\(\{ sealed_at: null/);
  });
});
