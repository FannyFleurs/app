import { describe, it, expect } from 'vitest';
import { splitPaymentsForAccountSettlement } from '@/lib/pos/split-combined-payment';

/**
 * Cœur du règlement combiné « vente + solde dû en un seul encaissement »
 * (CashRegister.tsx : case « Ajouter le solde dû au règlement » ; voir
 * accountSettlement sur PaymentModal.tsx). Extrait en fonction pure pour
 * être testé directement : le point critique est que la part VENTE doit
 * toujours sommer EXACTEMENT au total de la vente (SaleService.validate
 * rejette le moindre écart, PAYMENTS_MISMATCH) — jamais plus, jamais moins.
 */
describe('splitPaymentsForAccountSettlement', () => {
  function pay(amount: number, extra: Record<string, unknown> = {}) {
    return { method: 'card', label: 'Carte bancaire', amount, ...extra };
  }

  it('un seul règlement qui chevauche la frontière est scindé en deux, même mode', () => {
    const { salePayments, settlementPayments } = splitPaymentsForAccountSettlement([pay(79)], 49);
    expect(salePayments).toEqual([{ method: 'card', label: 'Carte bancaire', amount: 49, given_amount: 49 }]);
    expect(settlementPayments).toEqual([{ method: 'card', label: 'Carte bancaire', amount: 30, given_amount: 30 }]);
  });

  it('la part vente somme TOUJOURS exactement au total de la vente (jamais plus, jamais moins)', () => {
    const { salePayments } = splitPaymentsForAccountSettlement([pay(79)], 49);
    const saleTotal = salePayments.reduce((s, p) => s + p.amount, 0);
    expect(saleTotal).toBe(49);
  });

  it('plusieurs règlements (espèces + carte) répartis dans l\'ordre de saisie : la vente est servie en premier', () => {
    const payments = [pay(30, { method: 'cash', label: 'Espèces' }), pay(49, { method: 'card' })];
    const { salePayments, settlementPayments } = splitPaymentsForAccountSettlement(payments, 49);
    // Les 30€ espèces (saisis en premier) vont entièrement à la vente ; la
    // carte complète les 19€ restants de la vente, puis les 30€ du solde.
    expect(salePayments).toEqual([
      { method: 'cash', label: 'Espèces', amount: 30, given_amount: 30 },
      { method: 'card', label: 'Carte bancaire', amount: 19, given_amount: 19 },
    ]);
    expect(settlementPayments).toEqual([{ method: 'card', label: 'Carte bancaire', amount: 30, given_amount: 30 }]);
  });

  it('règlement EXACTEMENT égal au total de la vente : rien ne va au solde', () => {
    const { salePayments, settlementPayments } = splitPaymentsForAccountSettlement([pay(49)], 49);
    expect(salePayments).toEqual([{ method: 'card', label: 'Carte bancaire', amount: 49, given_amount: 49 }]);
    expect(settlementPayments).toEqual([]);
  });

  it('vente à 0€ (entièrement réglée par fidélité, par ex.) : tout va au solde', () => {
    const { salePayments, settlementPayments } = splitPaymentsForAccountSettlement([pay(30)], 0);
    expect(salePayments).toEqual([]);
    expect(settlementPayments).toEqual([{ method: 'card', label: 'Carte bancaire', amount: 30, given_amount: 30 }]);
  });

  it('un avoir/une carte cadeau (avec référence) conserve sa référence sur les deux segments', () => {
    const { salePayments, settlementPayments } = splitPaymentsForAccountSettlement(
      [pay(79, { method: 'gift_card', label: 'Carte cadeau 1234', reference: 'GC-1234' })], 49,
    );
    expect(salePayments[0]).toMatchObject({ reference: 'GC-1234', amount: 49 });
    expect(settlementPayments[0]).toMatchObject({ reference: 'GC-1234', amount: 30 });
  });

  it('trois règlements répartis dans l\'ordre de saisie, dont un scindé', () => {
    // Vente 49€ + solde 30€ = 79€. Saisie : 20€ espèces, 20€ chèque, 39€ carte.
    const payments = [
      pay(20, { method: 'cash', label: 'Espèces' }),
      pay(20, { method: 'check', label: 'Chèque' }),
      pay(39, { method: 'card' }),
    ];
    const { salePayments, settlementPayments } = splitPaymentsForAccountSettlement(payments, 49);
    // Vente : 20 (espèces) + 20 (chèque) + 9 (part de la carte) = 49.
    expect(salePayments).toEqual([
      { method: 'cash', label: 'Espèces', amount: 20, given_amount: 20 },
      { method: 'check', label: 'Chèque', amount: 20, given_amount: 20 },
      { method: 'card', label: 'Carte bancaire', amount: 9, given_amount: 9 },
    ]);
    // Solde : le reste de la carte (39 - 9 = 30).
    expect(settlementPayments).toEqual([
      { method: 'card', label: 'Carte bancaire', amount: 30, given_amount: 30 },
    ]);
  });
});
