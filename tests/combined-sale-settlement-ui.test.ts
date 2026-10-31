import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Règlement combiné « vente + solde dû » en un seul encaissement : le
 * client vient acheter, la caissière coche « Ajouter le solde dû au
 * règlement » et encaisse UNE fois (plutôt que de régler la vente, puis
 * séparément le solde, ou de bricoler un paiement « en compte » sur la
 * vente pour pouvoir tout regrouper plus tard).
 *
 * CashRegister.tsx / PaymentModal.tsx sont de très gros composants clients,
 * sans rendu complet en test (même choix que pour les autres fonctionnalités
 * de caisse) : on vérifie la présence et la condition exacte sur la source.
 * La logique de répartition elle-même est testée en isolation dans
 * split-combined-payment.test.ts.
 */
describe('Caisse — case « Ajouter le solde dû au règlement »', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('la case n\'apparaît QUE panier non vide (sinon le bouton « Régler le solde » seul reste)', () => {
    expect(page).toMatch(/\{lines\.length > 0 \? \(/);
    expect(page).toMatch(/Ajouter le solde dû au règlement/);
    expect(page).toMatch(/Régler le solde \(\{formatEUR\(-customerBalances\.account_balance\)\}\)/);
  });

  it('masquée si le poste est réellement hors-ligne (le règlement combiné nécessite deux appels serveur)', () => {
    expect(page).toMatch(/!shouldGoOffline\(\) && \(/);
  });

  it('le total affiché et transmis à PaymentModal inclut le solde dû quand la case est cochée', () => {
    expect(page).toMatch(/const payableWithDue = round2\(totals\.ttc \+ \(includeAccountDue \? accountDueAmount : 0\)\);/);
    expect(page).toMatch(/totalTtc=\{payableWithDue\}/);
  });

  it('transmet accountSettlement à PaymentModal uniquement quand la case est cochée et qu\'un solde existe', () => {
    expect(page).toMatch(/accountSettlement=\{[\s\S]{0,120}includeAccountDue && customer && accountDueAmount > 0[\s\S]{0,120}\}/);
  });

  it('la case se réinitialise à chaque changement/détachement de client (6 points de reset)', () => {
    const matches = page.match(/setIncludeAccountDue\(false\);/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });

  it('la vente offerte (0€) ne court-circuite plus PaymentModal quand un solde est ajouté', () => {
    expect(page).toMatch(/totals\.ttc === 0 && !\(includeAccountDue && accountDueAmount > 0\)/);
  });
});

describe('PaymentModal — accountSettlement (règlement combiné)', () => {
  const page = readFileSync('app/(app)/caisse/PaymentModal.tsx', 'utf8');

  it('plafonne la fidélité au total DE LA VENTE, jamais au solde dû combiné', () => {
    expect(page).toMatch(/const amt = round2\(Math\.min\(loyaltyRedemption, saleTotal\)\);/);
  });

  it('exclut « en compte » et le lien de paiement en mode combiné, comme en règlement de solde seul', () => {
    expect(page).toMatch(/!\(settlement \|\| accountSettlement\) \|\| \(m\.kind !== 'deferred' && m\.kind !== 'payment_link'\)/);
  });

  it('valide la VENTE d\'abord, puis le SOLDE avec le reste — jamais l\'inverse', () => {
    const idx = page.indexOf('if (accountSettlement) {');
    expect(idx).toBeGreaterThan(-1);
    const block = page.slice(idx, idx + 3000);
    const saleIdx = block.indexOf(`/api/sales/\${saleId}/validate`);
    const settleIdx = block.indexOf('/settle-payment');
    expect(saleIdx).toBeGreaterThan(-1);
    expect(settleIdx).toBeGreaterThan(saleIdx);
  });

  it('un échec du règlement de solde (vente déjà validée) affiche un message dédié, sans faire croire à un échec complet', () => {
    expect(page).toMatch(/Vente validée \(ticket \$\{saleJson\.receipt_number\}\), mais le règlement du solde dû/);
  });

  it('affiche le solde dû ajouté séparément du total du panier', () => {
    expect(page).toMatch(/\+ Solde dû ajouté/);
  });
});
