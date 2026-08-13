import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { creditNoteCopies, RECEIPT_DEFAULTS } from '@/lib/settings/receipt';

/**
 * Impression de l'avoir sur l'imprimante ticket.
 *
 * Lors d'une reprise de produit, l'avoir s'imprime sur l'imprimante ticket de
 * la boutique (plus seulement un PDF), en N exemplaires réglables — 2 par
 * défaut (un pour le client, un pour la boutique).
 */

describe('Nombre d\'exemplaires', () => {
  it('vaut 2 par défaut', () => {
    expect(RECEIPT_DEFAULTS.credit_note_copies).toBe(2);
  });

  it('borne entre 0 et 5, en entier', () => {
    expect(creditNoteCopies({ credit_note_copies: 2 })).toBe(2);
    expect(creditNoteCopies({ credit_note_copies: 0 })).toBe(0);
    expect(creditNoteCopies({ credit_note_copies: 9 })).toBe(5);
    expect(creditNoteCopies({ credit_note_copies: -1 })).toBe(0);
    expect(creditNoteCopies({ credit_note_copies: 2.6 })).toBe(3);
    expect(creditNoteCopies({ credit_note_copies: NaN })).toBe(0);
  });
});

describe('Câblage', () => {
  const returnRoute = readFileSync('app/api/sales/[id]/return/route.ts', 'utf8');
  const printService = readFileSync('lib/services/cloudprnt/print-credit-note.ts', 'utf8');
  const form = readFileSync('app/(app)/settings/receipt/ReceiptSettingsForm.tsx', 'utf8');

  it('la reprise imprime l\'avoir sans faire échouer le retour', () => {
    // Best-effort : l'impression est dans un try/catch, le retour est déjà
    // enregistré quand elle se lance.
    expect(returnRoute).toMatch(/enqueueCreditNotePrint/);
    expect(returnRoute).toMatch(/catch\s*\{[\s\S]*printed = null/);
  });

  it('un job par exemplaire est mis en file', () => {
    expect(printService).toMatch(/for \(let i = 0; i < copies; i\+\+\)/);
    expect(printService).toMatch(/enqueueJob/);
  });

  it('le réglage du nombre d\'exemplaires est dans le formulaire ticket', () => {
    expect(form).toMatch(/credit_note_copies/);
    expect(form).toMatch(/Exemplaires d&apos;avoir/);
  });
});
