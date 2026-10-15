import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Écran de clôture : garde-fous et textes retirés.
 *
 * On ne scelle pas une journée dont un règlement n'a pas été pointé : le
 * bouton reste inactif tant que tous les modes de paiement ne sont pas
 * validés. Et deux mentions techniques ont été retirées de l'écran.
 */

const src = readFileSync('app/(app)/closures/ClosuresAdmin.tsx', 'utf8');

describe('Clôture bloquée tant que les paiements ne sont pas validés', () => {
  it('conditionne le bouton à allPaymentsValidated', () => {
    expect(src).toMatch(/disabled=\{[^}]*!allPaymentsValidated/);
  });

  it('exige une saisie pour chaque règlement non-espèces', () => {
    // Chaque mode non-espèces doit porter une saisie réelle finie.
    expect(src).toMatch(/const allPaymentsValidated = useMemo/);
    expect(src).toMatch(/p\.method !== 'cash'/);
    expect(src).toMatch(/Number\.isFinite\(Number\(dv\)\)/);
  });

  it('exige le comptage des espèces s\'il y en a', () => {
    expect(src).toMatch(/hasCashLine/);
    expect(src).toMatch(/countedCash > 0/);
  });
});

describe('Textes retirés de la clôture', () => {
  it('ne mentionne plus l\'empreinte fiscale ni « Clôture scellée »', () => {
    expect(src).not.toMatch(/Clôture scellée/);
    expect(src).not.toMatch(/Empreinte fiscale/);
  });

  it('ne dit plus que les écarts d\'espèces ne sont plus pertinents', () => {
    expect(src).not.toMatch(/ne sont plus pertinents/);
    expect(src).not.toMatch(/écarts d.espèces ne sont plus/);
  });
});
