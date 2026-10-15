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

describe('Repli PDF du rapport Z — route correcte, jamais de navigation directe', () => {
  // L'auto-impression et le bouton manuel pointaient vers
  // /api/closures/daily/{id}/pdf, une route qui n'existe pas (404) — la
  // vraie route est /api/closures/{id}/z-pdf (voir app/api/closures/[id]/
  // z-pdf/route.ts). En plus d'être fausse, l'URL était ouverte via
  // window.open(...).print(), qui échappe vers Safari et perd la session
  // dans l'app native (même piège que les factures/avoirs — voir
  // components/PdfPreviewModal.tsx).
  it("n'utilise plus la route inexistante /api/closures/daily/{id}/pdf", () => {
    expect(src).not.toMatch(/closures\/daily\/\$\{[^}]*\}\/pdf/);
  });

  it('référence la vraie route /api/closures/{id}/z-pdf', () => {
    expect(src).toMatch(/`\/api\/closures\/\$\{[^}]*\}\/z-pdf`/);
  });

  it("passe par PdfPreviewModal plutôt que window.open(...).print()", () => {
    expect(src).toContain("import PdfPreviewModal from '@/components/PdfPreviewModal'");
    expect(src).toContain('<PdfPreviewModal');
    expect(src).not.toMatch(/window\.open\([^)]*z-pdf/);
    expect(src).not.toContain('w.print()');
  });

  it("ne rouvre pas l'aperçu si une imprimante CloudPRNT a déjà imprimé (z_printed)", () => {
    expect(src).toMatch(/if \(j\.z_printed\) return;/);
  });
});
