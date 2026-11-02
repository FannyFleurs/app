import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Toggle « CA boutique uniquement » : CADashboard.tsx (app CA) et
 * DashboardClient.tsx (Tableau de bord) sont de gros composants client,
 * sans rendu complet en test (même choix que CashRegister.tsx / BillingManager.tsx
 * ailleurs dans ce projet) : on vérifie le câblage exact sur la source.
 */
describe('app/ca/CADashboard.tsx — toggle CA boutique uniquement', () => {
  const src = readFileSync('app/ca/CADashboard.tsx', 'utf8');

  it('état local, désactivé par défaut', () => {
    expect(src).toMatch(/const \[excludeNonStore, setExcludeNonStore\] = useState\(false\);/);
  });

  it('le toggle passe exclude_non_store=1 aux requêtes CA (summary, summary-by-store, tickets)', () => {
    expect(src).toMatch(/if \(excludeNonStore\) qs\.set\('exclude_non_store', '1'\);/);
    expect(src).toMatch(/if \(excludeNonStore\) qsByStore\.set\('exclude_non_store', '1'\);/);
    expect(src).toMatch(/if \(excludeNonStore\) qs\.set\('exclude_non_store', '1'\);[\s\S]{0,200}api\/ca\/tickets/);
  });

  it('excludeNonStore fait partie des dépendances de reload (re-fetch au changement)', () => {
    expect(src).toMatch(/\}, \[range\.from, range\.to, storeId, excludeNonStore\]\);/);
  });
});

describe('app/(app)/dashboard/DashboardClient.tsx — toggle CA boutique uniquement', () => {
  const src = readFileSync('app/(app)/dashboard/DashboardClient.tsx', 'utf8');

  it('état local, désactivé par défaut', () => {
    expect(src).toMatch(/const \[excludeNonStore, setExcludeNonStore\] = useState\(false\);/);
  });

  it('le toggle passe exclude_non_store=1 à /api/analytics/dashboard', () => {
    expect(src).toMatch(/if \(excludeNonStore\) qs\.set\('exclude_non_store', '1'\);/);
  });

  it('excludeNonStore fait partie des dépendances de reload (re-fetch au changement)', () => {
    expect(src).toMatch(/\}, \[range\.from, range\.to, storeId, excludeNonStore\]\);/);
  });
});

describe('Réglages ▸ Exclusions du CA boutique — page et navigation', () => {
  it('la page existe et vérifie settings.read + le back-office', () => {
    const src = readFileSync('app/(app)/settings/ca-exclusions/page.tsx', 'utf8');
    expect(src).toMatch(/userCan\(user, 'settings\.read'\)/);
    expect(src).toMatch(/x-webpos-bo/);
  });

  it('le formulaire gère les 3 types d\'exclusion (customer, payment_method, category)', () => {
    const src = readFileSync('app/(app)/settings/ca-exclusions/CaExclusionsSettingsForm.tsx', 'utf8');
    expect(src).toMatch(/'customer'/);
    expect(src).toMatch(/'payment_method'/);
    expect(src).toMatch(/'category'/);
    expect(src).toMatch(/\/api\/settings\/ca-exclusions/);
  });

  it('l\'entrée de navigation existe dans settings/layout.tsx', () => {
    const src = readFileSync('app/(app)/settings/layout.tsx', 'utf8');
    expect(src).toMatch(/\/settings\/ca-exclusions.*Exclusions du CA boutique/);
  });
});
