import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Avoirs visibles sur la fiche client.
 *
 * Un avoir né d'une reprise de produit doit apparaître sur la fiche du client
 * de la vente — pas seulement compter dans le solde « Crédits à dépenser ».
 * La fiche gagne un onglet « Avoirs », alimenté par un endpoint qui rattache
 * l'avoir au client par la même règle que le solde.
 */

const list = readFileSync('app/(app)/customers/CustomersList.tsx', 'utf8');
const route = readFileSync('app/api/customers/[id]/credit-notes/route.ts', 'utf8');

describe('Onglet Avoirs', () => {
  it('existe dans la fiche client', () => {
    expect(list).toMatch(/key: 'avoirs',\s*label: 'Avoirs'/);
    expect(list).toMatch(/tab === 'avoirs'\s*&&\s*<CreditNotesTable/);
    expect(list).toMatch(/function CreditNotesTable/);
  });

  it('donne un accès au PDF de chaque avoir', () => {
    expect(list).toMatch(/\/api\/credit-notes\/\$\{cn\.id\}\/pdf/);
  });
});

describe('Endpoint des avoirs', () => {
  it('rattache l\'avoir au client par la vente comme en direct', () => {
    // Même COALESCE que le solde : l'avoir compte pour ce client par son
    // customer_id, ou à défaut celui de la vente / facture d'origine.
    expect(route).toMatch(/COALESCE\(cn\.customer_id, s\.customer_id, i\.customer_id\)/);
  });

  it('retombe sur la jointure seule sans la colonne customer_id', () => {
    // Rétrocompat migration 0014.
    expect(route).toMatch(/COALESCE\(s\.customer_id, i\.customer_id\)/);
  });

  it('exige la permission de lecture clients', () => {
    expect(route).toMatch(/requirePermission\('customers\.read'\)/);
  });
});
