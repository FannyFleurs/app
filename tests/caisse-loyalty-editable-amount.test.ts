import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Utilisation de la fidélité en caisse : le solde entier était appliqué en
 * un clic, sans possibilité de réduire le montant. Un champ libre permet
 * désormais de choisir le montant à utiliser (par défaut le solde entier).
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (voir tests/ma-journee.test.ts pour le même choix) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('Caisse — montant de fidélité modifiable', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('un champ de saisie libre existe pour le montant de fidélité à utiliser', () => {
    expect(page).toMatch(/const \[loyaltyAmountStr, setLoyaltyAmountStr\] = useState/);
    expect(page).toMatch(/<input[\s\S]{0,200}value=\{loyaltyAmountStr\}/);
  });

  it('le bouton "Utiliser" applique le montant SAISI, pas automatiquement le solde entier', () => {
    expect(page).not.toMatch(/onClick=\{\(\) => useLoyalty\(loyalty\.balance_euros\)\}/);
    expect(page).toMatch(/onClick=\{\(\) => useLoyalty\(Number\(loyaltyAmountStr\.replace/);
  });

  it('le champ est initialisé au solde entier par défaut', () => {
    expect(page).toMatch(
      /setLoyaltyAmountStr\(loyalty\.balance_euros > 0 \? String\(loyalty\.balance_euros\) : ''\)/,
    );
  });

  it('useLoyalty plafonne aussi au solde disponible (pas seulement au panier)', () => {
    expect(page).toMatch(
      /Math\.min\(round2\(amountEuros\), round2\(subtotal\), round2\(loyalty\.balance_euros\)\)/,
    );
  });
});
