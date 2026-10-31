import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Toggle « Afficher le CA du jour sur la caisse » (Paramètres > Paramètres
 * caisse) : réglage PAR BOUTIQUE, même motif que « Afficher le stock sur la
 * tuile » (voir ca-reveal-server.ts / show-stock-server.ts).
 *
 * POSSettingsForm.tsx est un très gros composant client, sans rendu complet
 * en test (même choix que CashRegister.tsx) : on vérifie la présence et la
 * condition exacte sur la source.
 */
describe('Paramètres caisse — toggle CA du jour', () => {
  const page = readFileSync('app/(app)/pos-settings/POSSettingsForm.tsx', 'utf8');

  it('reçoit initialCaReveal et déclare l\'état PAR BOUTIQUE correspondant', () => {
    expect(page).toMatch(/initialCaReveal: boolean;/);
    expect(page).toMatch(/const \[caRevealStoreId, setCaRevealStoreId\] = useState<string>\(lockStoreId \?\? ''\);/);
    expect(page).toMatch(/const \[caReveal, setCaReveal\] = useState<boolean>\(initialCaReveal\);/);
  });

  it('sauvegarde via PATCH /api/settings/pos/ca-reveal avec le store_id sélectionné', () => {
    expect(page).toMatch(/fetch\('\/api\/settings\/pos\/ca-reveal', \{/);
    expect(page).toMatch(/body: JSON\.stringify\(\{ store_id: caRevealStoreId \|\| null, enabled: caReveal \}\)/);
  });

  it('affiche le toggle dans une Section dédiée', () => {
    expect(page).toMatch(/title="CA du jour sur la caisse"/);
    expect(page).toMatch(/label="Afficher le CA du jour sur la caisse"/);
  });
});
