import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { SaleService } from '@/lib/services/sale-service';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { computeDayReport } from '@/lib/services/day-report';

/**
 * Rapport de journée — espèces/CB scindées en deux lignes, et remise en
 * banque automatique pour un fond de caisse fixe.
 *
 * 1) Une vente dont le règlement a label=NULL (ligne antérieure à
 *    payments.label, voir migrations/0094) et une autre avec le libellé
 *    générique habituel ("Espèces") pour le MÊME method apparaissaient comme
 *    deux lignes "Espèces" distinctes sur le Z — et, plus grave, le total
 *    espèces de fermeture ne comptait qu'UNE des deux lignes (.find() sur un
 *    tableau désormais dupliqué), sous-évaluant les espèces attendues.
 * 2) Une boutique au fond de caisse FIXE ("toujours le même montant")
 *    retire chaque soir le surplus, sans forcément l'enregistrer comme
 *    Prélèvement dans l'app — la ligne "Remise banque" du Z doit refléter
 *    ce surplus automatiquement.
 *
 * Intégration contre une vraie base Postgres, comme payment-label.test.ts.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Rapport de journée — espèces/CB scindées et remise en banque', () => {
  let organizationId: string;
  let userId: string;
  let productId: string;
  let businessDate: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Day Report Cash ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `drc-${randomUUID()}@example.test`],
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
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeStore(code: string): Promise<{ storeId: string; registerId: string }> {
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, $2, $2) RETURNING id`,
      [organizationId, code],
    );
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, store.rows[0]!.id],
    );
    return { storeId: store.rows[0]!.id, registerId: register.rows[0]!.id };
  }

  async function cashSale(storeId: string, registerId: string, label: string | undefined, amount: number): Promise<void> {
    const draft = await SaleService.createDraft({ organizationId, storeId, registerId, userId });
    await SaleService.setLines(draft.id, organizationId, [{
      product_id: productId, label: 'Bouquet test', unit_price_ttc: amount, quantity: 1,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    await SaleService.validate({
      saleId: draft.id, organizationId, userId,
      payments: [{ method: 'cash', amount, label }],
    });
  }

  it("fusionne une ligne espèces sans libellé (NULL) avec la ligne espèces normale, sans sous-évaluer le total attendu", async () => {
    const { storeId, registerId } = await makeStore('DRC1');
    await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 100 });

    // Simule une vente antérieure à payments.label (label=NULL) et une vente
    // normale (label='Espèces', figé au paiement) — même journée, même boutique.
    await cashSale(storeId, registerId, undefined, 16.40);
    await cashSale(storeId, registerId, 'Espèces', 38.80);

    const report = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });

    const cashRows = report.payments.filter((p) => p.method === 'cash');
    expect(cashRows).toHaveLength(1);
    expect(cashRows[0]!.amount).toBeCloseTo(55.20, 2);
    expect(cashRows[0]!.count).toBe(2);

    // Le total espèces de fermeture doit compter LES DEUX ventes, pas une seule.
    expect(report.cash.total_espece_fermeture).toBeCloseTo(100 + 55.20, 2);
  });

  it("fond de caisse fixe : la ligne Remise banque reflète automatiquement le surplus, sans prélèvement enregistré", async () => {
    const { storeId, registerId } = await makeStore('DRC2');
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [organizationId, `opening_float:${storeId}`, JSON.stringify({ mode: 'fixed', amount: 100 })],
    );
    await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 100 });
    await cashSale(storeId, registerId, 'Espèces', 70);

    const report = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });

    expect(report.cash.fonds_de_caisse).toBe(100);
    expect(report.cash.remise_banque).toBeCloseTo(70, 2); // surplus au-delà du fond fixe
    expect(report.cash.total_espece_fermeture).toBeCloseTo(100, 2); // revient au fond fixe
  });

  it("fond de caisse MANUEL (par défaut) : aucune remise banque automatique", async () => {
    const { storeId, registerId } = await makeStore('DRC3');
    await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 100 });
    await cashSale(storeId, registerId, 'Espèces', 70);

    const report = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });

    expect(report.cash.remise_banque).toBe(0);
    expect(report.cash.total_espece_fermeture).toBeCloseTo(170, 2);
  });

  it("un prélèvement réellement enregistré prime sur l'estimation automatique", async () => {
    const { storeId, registerId } = await makeStore('DRC4');
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [organizationId, `opening_float:${storeId}`, JSON.stringify({ mode: 'fixed', amount: 100 })],
    );
    const session = await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 100 });
    await cashSale(storeId, registerId, 'Espèces', 70);
    // Prélèvement réel de 50 € (pas le surplus exact de 70 €) : doit primer tel quel.
    await query(
      `INSERT INTO cash_movements (organization_id, cash_session_id, movement_type, amount, reason, user_id)
       VALUES ($1, $2, 'out', 50, 'Prélèvement', $3)`,
      [organizationId, session.id, userId],
    );

    const report = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });

    expect(report.cash.remise_banque).toBeCloseTo(50, 2);
    expect(report.cash.total_espece_fermeture).toBeCloseTo(100 + 70 - 50, 2);
  });
});
