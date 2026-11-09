import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Panier caisse : le bouton unique « Paiement » est remplacé par deux
 * boutons — "CB" (2/3 de la largeur) encaisse directement par carte
 * (montant plein, sans ouvrir la page de règlement) et "Autres" (1/3) ouvre
 * la page de règlement habituelle (PaymentModal, où l'étape « Valider » a
 * elle aussi été supprimée — voir payment-modal-auto-validate.test.tsx).
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (même choix que pour les autres gros composants de ce projet, voir
 * caisse-loyalty-editable-amount.test.ts) : on vérifie la présence et le
 * câblage exact sur la source.
 */
describe('Panier — boutons "CB" / "Autres" remplacent "Paiement"', () => {
  const src = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('affiche deux boutons côte à côte en 2/3 (CB) · 1/3 (Autres), "CB" appelle quickPayCard, "Autres" ouvre PaymentModal comme avant', () => {
    expect(src).toMatch(/className="grid grid-cols-3 gap-2"/);
    expect(src).toMatch(/className="col-span-2 btn-primary[^"]*"[\s\S]{0,40}title="Encaisser directement par carte bancaire/);
    expect(src).toMatch(/onClick=\{\(\) => void quickPayCard\(\)\}/);
    expect(src).toMatch(/<span>\{cbBusy \? '…' : 'CB'\}<\/span>/);
    expect(src).toMatch(/if \(shouldGoOffline\(\)\) \{ setShowPayment\(true\); return; \}\s*\n\s*const id = await ensureSale\(\); if \(id\) \{ await syncLines\(\); setShowPayment\(true\); \}/);
    expect(src).toMatch(/<span>Autres<\/span>/);
  });

  it("quickPayCard combine fidélité + carte, dans cet ordre, pour le montant plein", () => {
    const idx = src.indexOf('async function quickPayCard');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 2600);
    expect(block).toMatch(/const cardAmount = round2\(payableWithDue - loyaltyApplied\);/);
    expect(block).toMatch(/if \(loyaltyApplied > 0\) payments\.push\(\{ method: 'loyalty', amount: loyaltyApplied, label: 'Fidélité' \}\);/);
    expect(block).toMatch(/if \(cardAmount > 0\) payments\.push\(\{ method: 'card', amount: cardAmount, label: 'Carte bancaire' \}\);/);
  });

  it('quickPayCard gère le mode hors-ligne et le mode école comme validateZeroSale (mêmes raccourcis, pas de duplication divergente)', () => {
    const idx = src.indexOf('async function quickPayCard');
    const block = src.slice(idx, idx + 2600);
    expect(block).toMatch(/if \(shouldGoOffline\(\)\) \{/);
    expect(block).toMatch(/await finalizeOffline\(/);
    expect(block).toMatch(/if \(schoolMode\) \{/);
    expect(block).toMatch(/ECOLE-\$\{new Date\(\)\.toISOString\(\)\.slice\(11, 19\)\.replace\(\/:\/g, ''\)\}/);
  });

  it('quickPayCard répartit vente + solde dû combiné comme PaymentModal (splitPaymentsForAccountSettlement)', () => {
    const idx = src.indexOf('async function quickPayCard');
    const block = src.slice(idx, idx + 2600);
    expect(block).toMatch(/if \(includeAccountDue && customer && accountDueAmount > 0\) \{/);
    expect(block).toMatch(/splitPaymentsForAccountSettlement\(payments, totals\.ttc\)/);
  });

  it('les modes de règlement de la boutique sont chargés une fois (pas à chaque tap sur "CB")', () => {
    expect(src).toMatch(/const \[paymentMethods, setPaymentMethods\] = useState<Array<\{ kind: CheckoutMethod; opens_drawer\?: boolean \}>>\(\[\]\);/);
    expect(src).toMatch(/fetch\(`\/api\/payment-methods\?store_id=\$\{encodeURIComponent\(storeId\)\}`\)/);
  });
});
