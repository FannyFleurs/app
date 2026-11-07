import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Clôture — détail des paiements d'un mode de règlement (pointage 1 à 1 des
 * tickets en cas d'écart de caisse). Ne change RIEN à la réconciliation
 * existante (saisie réelle / montant conforme) : vérifie uniquement le
 * câblage de la nouvelle fonctionnalité sur la source, ClosuresAdmin.tsx
 * étant un très gros composant client sans rendu complet en test (même
 * choix que closures-admin.test.ts).
 */
describe('Réconciliation des paiements — ouverture du détail au clic', () => {
  const src = readFileSync('app/(app)/closures/ClosuresAdmin.tsx', 'utf8');

  it('importe PaymentDrilldownModal', () => {
    expect(src).toMatch(/import PaymentDrilldownModal from '\.\/PaymentDrilldownModal';/);
  });

  it('la ligne de réconciliation déclenche setDrillMethod au clic, sans toucher à la saisie réelle existante', () => {
    expect(src).toMatch(/onClick=\{\(\) => setDrillMethod\(p\.method\)\}/);
    // La saisie réelle / montant conforme (declared) reste intacte à côté.
    expect(src).toMatch(/setDeclared\(\{ \.\.\.declared, \[p\.method\]: e\.target\.value \}\)/);
  });

  it('le pointage (ticked) est tenu en mémoire par mode, jamais persisté', () => {
    expect(src).toMatch(/const \[tickedByMethod, setTickedByMethod\] = useState<Record<string, Set<string>>>\(\{\}\);/);
    expect(src).toMatch(/function toggleTicked\(method: string, id: string\)/);
  });

  it('la modale reçoit le total et le nombre système du mode concerné (même source que la réconciliation)', () => {
    const idx = src.indexOf('drillMethod && (() => {');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/methodTotal=\{p\.total\}/);
    expect(block).toMatch(/methodCount=\{p\.count\}/);
  });
});

describe('PaymentDrilldownModal — détail en lecture seule', () => {
  const src = readFileSync('app/(app)/closures/PaymentDrilldownModal.tsx', 'utf8');

  it('interroge /api/closures/daily/payments avec store_id, date et method', () => {
    expect(src).toMatch(/\/api\/closures\/daily\/payments\?store_id=/);
    expect(src).toMatch(/&date=\$\{encodeURIComponent\(date\)\}&method=\$\{encodeURIComponent\(method\)\}/);
  });

  it('chaque ligne a une case à cocher reliée à onToggleTicked, pas une écriture directe', () => {
    expect(src).toMatch(/onChange=\{\(\) => onToggleTicked\(p\.id\)\}/);
    expect(src).not.toMatch(/fetch\(`\/api\/closures\/daily\/payments\/\$\{p\.id\}/);
  });
});
