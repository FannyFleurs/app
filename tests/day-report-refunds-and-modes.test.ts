// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { SaleService } from '@/lib/services/sale-service';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { ReturnService } from '@/lib/services/return-service';
import { computeDayReport } from '@/lib/services/day-report';

/**
 * Deux manques sur le rapport de journée (Z/X), remontés en relisant un
 * ticket imprimé :
 *
 * 1. Un remboursement espèces (retour) sort bien du tiroir (cash_movements
 *    'out'), mais n'apparaissait NULLE PART sur le Z — ni déduit des ventes
 *    espèces (volontaire : le CA reste brut), ni affiché comme sa propre
 *    ligne. Résultat : le lecteur ne pouvait pas vérifier que le total
 *    espèces de fermeture tenait compte du remboursement. Même règle que
 *    Ma Journée (sales/today/route.ts : cm.reason ILIKE 'Remboursement%').
 *
 * 2. La section "CA TTC Modes de ventes" (Sur place / À emporter /
 *    Livraison) s'affichait même pour une boutique qui n'utilise jamais
 *    cette distinction — toujours un seul bloc "Sur place" à 100%, donc
 *    aucune information. Masquée quand une seule modalité est présente.
 *
 * Intégration contre une vraie base Postgres.
 */
describe('Rapport de journée — remboursements espèces et modes de vente', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let productId: string;
  let businessDate: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Refunds Modes ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'RM', 'Refunds Modes') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `rm-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    const taxRate = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate) VALUES ($1, 'STD', '20%', 20) RETURNING id`,
      [organizationId],
    );
    const product = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, unit, tax_rate_id, sale_price_ttc)
       VALUES ($1, 'Bouquet test', 'unité', $2, 50) RETURNING id`,
      [organizationId, taxRate.rows[0]!.id],
    );
    productId = product.rows[0]!.id;
    businessDate = new Date().toISOString().slice(0, 10);

    await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 200 });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("une boutique sans aucune commande (livraison/à emporter) n'affiche qu'une seule modalité", async () => {
    const draft = await SaleService.createDraft({ organizationId, storeId, registerId, userId });
    await SaleService.setLines(draft.id, organizationId, [{
      product_id: productId, label: 'Bouquet test', unit_price_ttc: 50, quantity: 1,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    await SaleService.validate({ saleId: draft.id, organizationId, userId, payments: [{ method: 'cash', amount: 50 }] });

    const report = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(report.by_mode).toHaveLength(1);
    expect(report.by_mode[0]!.mode).toBe('Sur place');
  });

  it('un remboursement espèces (retour PARTIEL) apparaît sur sa propre ligne, et le total espèces de fermeture en tient compte', async () => {
    // 2 unités vendues, 1 seule retournée : la vente reste "validated" (pas
    // d'annulation totale), pour isoler l'effet du remboursement des ventes
    // espèces (CA), qui doivent rester BRUTES — exactement le scénario
    // remonté (vente de plusieurs articles, un seul retourné/remboursé).
    const draft = await SaleService.createDraft({ organizationId, storeId, registerId, userId });
    await SaleService.setLines(draft.id, organizationId, [{
      product_id: productId, label: 'Bouquet test', unit_price_ttc: 20, quantity: 2,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    const sale = await SaleService.validate({
      saleId: draft.id, organizationId, userId, payments: [{ method: 'cash', amount: 40 }],
    });

    const before = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(before.cash.remboursements_especes).toBe(0);
    const especesAvant = before.payments.find((p) => p.method === 'cash')?.amount ?? 0;
    const fermetureAvant = before.cash.total_espece_fermeture;

    await ReturnService.createCreditNote({
      saleId: sale.saleId, organizationId, userId,
      lines: [{ line_index: 0, quantity: 1 }],
      refundMethod: 'cash',
      reason: 'Article abîmé',
    });

    const after = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(after.cash.remboursements_especes).toBeCloseTo(20, 2);
    // Les ventes espèces (CA) restent BRUTES, volontairement non affectées.
    expect(after.payments.find((p) => p.method === 'cash')?.amount ?? 0).toBeCloseTo(especesAvant, 2);
    // Mais le total espèces de fermeture (tiroir) encaisse bien le remboursement.
    expect(after.cash.total_espece_fermeture).toBeCloseTo(fermetureAvant - 20, 2);
  });
});
