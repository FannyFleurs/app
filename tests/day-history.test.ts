import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SIDEBAR_ITEMS } from '@/components/Sidebar';

/**
 * Page « Historiques ».
 *
 * Le journal des espèces et des gestes sensibles : qui a ouvert le tiroir, qui
 * a annulé une vente, combien est parti à la banque. Les faits existaient déjà,
 * éparpillés entre quatre tables ; ce qui manquait, c'était de les lire
 * ensemble — et de ne pas les montrer à tout le monde.
 */

const service = readFileSync('lib/services/day-history.ts', 'utf8');
const route = readFileSync('app/api/history/day/route.ts', 'utf8');

describe('Accès au journal', () => {
  it('est réservé à qui clôture la journée', () => {
    // Le journal surveille le travail de l'équipe : il ne s'ouvre pas au
    // vendeur dont il compte les ouvertures de tiroir.
    expect(route).toContain("requirePermission('closures.daily')");
    const entree = SIDEBAR_ITEMS.find((i) => i.href === '/historiques');
    expect(entree?.perm).toBe('closures.daily');
    expect(entree?.group).toBe('Pilotage');
  });

  it('est au menu du back-office ET de la caisse', () => {
    // « Toutes les pages » de la caisse est bâti sur la même liste : une
    // entrée marquée boOnly disparaîtrait du comptoir.
    const entree = SIDEBAR_ITEMS.find((i) => i.href === '/historiques');
    expect(entree?.boOnly).toBeUndefined();
    expect(entree?.appOnly).toBeUndefined();
    expect(readFileSync('components/AllPagesOverlay.tsx', 'utf8')).toContain('SIDEBAR_ITEMS');
  });

  it('se rejoint depuis les actions rapides de Ma journée', () => {
    expect(readFileSync('app/(app)/ma-journee/MaJourneeClient.tsx', 'utf8'))
      .toMatch(/label="Historiques" href="\/historiques"/);
  });
});

describe('Contenu du journal', () => {
  it('couvre les quatre sources de la journée', () => {
    // Une source oubliée, et le journal ment par omission.
    for (const table of ['cash_sessions', 'cash_movements', 'daily_closures', 'audit_logs']) {
      expect(service, table).toContain(table);
    }
  });

  it('nomme les gestes attendus', () => {
    for (const libelle of [
      'Ouverture de caisse', 'Fermeture de caisse',
      'Ouverture manuelle du tiroir', 'Clôture de journée',
      'Vente validée annulée', 'Retour / avoir', 'Code PIN refusé',
    ]) {
      expect(service, libelle).toContain(libelle);
    }
    // Le prélèvement (ex-« remise en banque ») tire son libellé du module
    // partagé cash-deposit, pour que l'affichage et la catégorisation SQL ne
    // puissent pas diverger.
    expect(service).toMatch(/DEPOSIT_LABEL/);
  });

  it('ne compte une session que le jour du geste', () => {
    // Une caisse ouverte hier et fermée aujourd'hui ne doit pas réapparaître
    // comme « ouverte » aujourd'hui : le tri est fait en SQL.
    expect(service).toMatch(/opened_at::date = \$3::date\) AS opened_today/);
    expect(service).toMatch(/if \(s\.opened_today\)/);
    expect(service).toMatch(/if \(s\.closed_at && s\.closed_today\)/);
  });

  it('n\'attribue pas à une boutique ce qui appartient à l\'organisation', () => {
    // audit_logs ne porte pas de boutique : on garde les lignes qui désignent
    // celle-ci, plus celles qui n'en désignent aucune (droits, réglages).
    expect(service).toMatch(/payload->>'store_id' IS NULL OR a\.payload->>'store_id' = \$2/);
  });

  it('signale ce qui mérite un œil', () => {
    // L'écart de caisse, l'annulation et l'accès refusé doivent ressortir,
    // sinon la page n'est qu'une liste de plus.
    expect(service).toMatch(/attention: ecart != null && Math\.abs\(ecart\) >= 0\.01/);
    expect(service).toMatch(/sensitive_count: events\.filter\(\(e\) => e\.attention\)\.length/);
  });

  it('compte les ouvertures du tiroir par personne', () => {
    // La question posée est « combien de fois, et par qui ».
    expect(service).toMatch(/drawer_by_person/);
    expect(service).toMatch(/parPersonne\.set\(qui, \(parPersonne\.get\(qui\) \?\? 0\) \+ 1\)/);
  });
});
