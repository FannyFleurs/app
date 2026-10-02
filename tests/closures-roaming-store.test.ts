import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Clôture de caisse (/closures) pour un poste itinérant (pos.roaming_device).
 *
 * Bug remonté en production : un admin itinérant sur "Fanny Fleurs Mortagne"
 * atterrissait directement sur la confirmation de clôture d'une AUTRE
 * boutique ("Fanny Fleurs Alençon", déjà clôturée) sans aucun moyen de
 * corriger — ClosuresAdmin.tsx n'offre aucun sélecteur de boutique, et la
 * résolution serveur (resolveDeviceStoreId, basée sur la liaison PERMANENTE
 * registers.device_id) ne connaît pas le choix itinérant, mémorisé
 * uniquement en localStorage (lib/caisse/roaming.ts). Sans correction, elle
 * retombe sur la 1re boutique de l'organisation (ORDER BY name) — jamais
 * celle réellement choisie — d'où l'impression de "cliquer indéfiniment sans
 * que la bonne boutique ne soit jamais fermée" : chaque tentative clôturait
 * silencieusement la MAUVAISE boutique.
 *
 * Deux corrections complémentaires, comme pour /ma-journee (voir
 * tests/ma-journee.test.ts) :
 *  1. Le lien "Fermer ma caisse" (Ma journée) transmet désormais le store_id
 *     itinérant en query ; /closures le priorise sur resolveDeviceStoreId.
 *  2. Filet de sécurité côté client (ClosuresAdmin.tsx) pour toute autre
 *     porte d'entrée vers /closures.
 */
describe('Poste itinérant — /closures ne doit plus clôturer la mauvaise boutique', () => {
  const page = readFileSync('app/(app)/closures/page.tsx', 'utf8');
  const admin = readFileSync('app/(app)/closures/ClosuresAdmin.tsx', 'utf8');
  const maJournee = readFileSync('app/(app)/ma-journee/MaJourneeClient.tsx', 'utf8');

  it('closures/page.tsx priorise un store_id explicite (query) sur resolveDeviceStoreId', () => {
    expect(page).toMatch(/searchParams\?\.store_id/);
    // Validé contre les boutiques de l'organisation avant d'être utilisé —
    // jamais un id arbitraire passé en clair dans l'URL.
    expect(page).toMatch(/stores\.rows\.some\(\(s\) => s\.id === requestedStoreId\)/);
    expect(page).toMatch(
      /const defaultStoreId = \(requestedStoreValid \? requestedStoreId : null\)\s*\n\s*\?\? \(await resolveDeviceStoreId/,
    );
  });

  it('MaJourneeClient transmet le store_id itinérant au lien "Fermer ma caisse"', () => {
    expect(maJournee).toMatch(
      /const closuresHref = roamingStoreId \? `\/closures\?store_id=\$\{encodeURIComponent\(roamingStoreId\)\}` : '\/closures';/,
    );
    expect(maJournee).toMatch(/<a href=\{closuresHref\}/);
    // L'ancien lien en dur ne doit plus exister : les deux boutons (journée
    // déjà close / à fermer) doivent passer par closuresHref.
    expect(maJournee).not.toMatch(/<a href="\/closures"/);
  });

  it('ClosuresAdmin.tsx corrige storeId depuis le choix itinérant, filet de sécurité quel que soit le chemin d\'arrivée', () => {
    expect(admin).toContain("import { readRoamingChoice } from '@/lib/caisse/roaming'");
    expect(admin).toMatch(/const roamingStoreId = readRoamingChoice\(\)\?\.storeId;/);
    // Ne corrige QUE si la boutique itinérante existe réellement pour cette
    // organisation — jamais un id orphelin ou périmé.
    expect(admin).toMatch(/stores\.some\(\(s\) => s\.id === roamingStoreId\)/);
    expect(admin).toMatch(/setStoreId\(roamingStoreId\);/);
  });
});
