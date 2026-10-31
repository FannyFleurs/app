import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Utilisation de la fidélité en caisse : un bouton simple applique le solde
 * entier en un clic (comportement d'origine, restauré pour réduire
 * l'encombrement de la zone ticket) ; un bouton « ✎ » à côté révèle, à la
 * demande seulement, un champ libre pour utiliser un montant moindre.
 *
 * CashRegister.tsx est un très gros composant client, sans rendu complet en
 * test (voir tests/ma-journee.test.ts pour le même choix) : on vérifie la
 * présence et la condition exacte sur la source.
 */
describe('Caisse — fidélité : bouton simple par défaut, montant modifiable au clic', () => {
  const page = readFileSync('app/(app)/caisse/CashRegister.tsx', 'utf8');

  it('par défaut, un seul clic sur le bouton principal applique le solde entier', () => {
    expect(page).toMatch(/onClick=\{\(\) => useLoyalty\(loyalty\.balance_euros\)\}/);
  });

  it('le champ de saisie libre est masqué par défaut, révélé par editingLoyaltyAmount', () => {
    expect(page).toMatch(/const \[editingLoyaltyAmount, setEditingLoyaltyAmount\] = useState\(false\);/);
    expect(page).toMatch(/&& editingLoyaltyAmount && \(/);
    expect(page).toMatch(/<input[\s\S]{0,200}value=\{loyaltyAmountStr\}/);
  });

  it('un bouton dédié ("Modifier le montant") révèle le champ', () => {
    expect(page).toMatch(/onClick=\{\(\) => setEditingLoyaltyAmount\(true\)\}/);
  });

  it('le bouton "Utiliser" du champ applique le montant SAISI, puis referme le champ', () => {
    expect(page).toMatch(/onClick=\{\(\) => \{ useLoyalty\(Number\(loyaltyAmountStr\.replace\([\s\S]{0,80}setEditingLoyaltyAmount\(false\); \}\}/);
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

  it('partage une rangée côte à côte avec la pastille « En compte » (pas deux lignes pleine largeur)', () => {
    expect(page).toMatch(/const showLoyaltySimple = loyalty\.enabled && loyalty\.balance_euros >= loyalty\.min_redeem/);
    expect(page).toMatch(/\{\(accountDueAmount > 0 \|\| showLoyaltySimple\) && \(/);
    expect(page).toMatch(/<div className="flex items-stretch gap-1\.5">/);
  });
});
