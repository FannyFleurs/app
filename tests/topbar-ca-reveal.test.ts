import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * CA du jour sur la TopBar de la caisse : icône œil (à gauche du bouton
 * assistance, même hauteur/police que les onglets du menu), remplacée au
 * clic par le CA du jour — réglage PAR BOUTIQUE (voir ca-reveal-server.ts),
 * résolu au niveau layout (app/(app)/layout.tsx) et transmis via AppShell.
 *
 * TopBar.tsx est un composant client sans rendu complet en test (même choix
 * que CashRegister.tsx/MaJourneeClient.tsx) : on vérifie la présence et la
 * condition exacte sur la source.
 */
describe('TopBar — CA du jour (icône œil)', () => {
  const page = readFileSync('components/TopBar.tsx', 'utf8');

  it('le bouton est conditionné à caReveal ET à l\'écran de caisse uniquement', () => {
    expect(page).toMatch(/\{caReveal && path === '\/caisse' && \(/);
  });

  it('affiche l\'icône œil avant révélation, puis le CA formaté en euros après', () => {
    expect(page).toMatch(/<Icon name="eye" size=\{20\} \/>/);
    expect(page).toMatch(/\{formatEUR\(caValue\)\}/);
  });

  it('interroge /api/ca/summary avec le store_id et la date du jour au clic', () => {
    expect(page).toMatch(/\/api\/ca\/summary\?store_id=\$\{storeId\}&from=\$\{today\}&to=\$\{today\}/);
  });

  it('est positionné avant le bouton assistance (même emplacement/hauteur)', () => {
    const caIdx = page.indexOf("caReveal && path === '/caisse'");
    const assistanceIdx = page.indexOf("permissions.has('support.request')");
    expect(caIdx).toBeGreaterThan(-1);
    expect(assistanceIdx).toBeGreaterThan(-1);
    expect(caIdx).toBeLessThan(assistanceIdx);
  });
});

describe('AppShell / layout — résolution de caReveal', () => {
  const appShell = readFileSync('components/AppShell.tsx', 'utf8');
  const layout = readFileSync('app/(app)/layout.tsx', 'utf8');

  it('AppShell transmet caReveal à TopBar', () => {
    expect(appShell).toMatch(/caReveal=\{caReveal\}/);
  });

  it('le layout ne résout caReveal ni en back-office ni sans poste appairé (deviceStoreId)', () => {
    expect(layout).toMatch(/!backOffice && deviceStoreId/);
    expect(layout).toMatch(/loadCaRevealOverride\(user\.organizationId, deviceStoreId\)/);
  });
});
