import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { SaleService } from '@/lib/services/sale-service';
import { ClosingService } from '@/lib/services/closing-service';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { computeDayReport } from '@/lib/services/day-report';
import {
  createPendingStoreOperation,
} from '@/lib/services/pending-store-operations';

/**
 * Correction comptable « carte cadeau = encaissement, pas CA » — bout en
 * bout, contre une VRAIE base Postgres (les requêtes SQL modifiées sont trop
 * nombreuses et interdépendantes pour rester crédibles derrière un mock).
 *
 * Nécessite DATABASE_URL (voir README/`.env.example`) : appliquer les
 * migrations (`npm run db:migrate`) sur une base de test avant de lancer ce
 * fichier. Sans DATABASE_URL, la suite est ignorée (elle ne doit jamais faire
 * échouer `npm test` dans un environnement sans Postgres).
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Comptabilité cartes cadeaux (CA vs encaissement) — intégration DB', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let productId: string;
  let businessDate: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Org ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T1', 'Boutique Test') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;

    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse Test') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `test-${randomUUID()}@example.test`],
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

  it('scénario complet (carte émise en caisse) : émission = encaissement, CA=0 ; utilisation = CA, sans double comptage', async () => {
    const openSession = await CashSessionService.open({
      organizationId, storeId, registerId, userId, openingFloat: 100,
    });

    // 1. Émission d'une carte cadeau de 50 € payée en espèces.
    const draft1 = await SaleService.createDraft({ organizationId, storeId, registerId, userId });
    await SaleService.setLines(draft1.id, organizationId, [{
      label: 'Carte cadeau', unit_price_ttc: 50, quantity: 1, tax_rate: 0, tax_rate_code: 'CADEAU',
      metadata: { gift_card: true },
    }]);
    const issued = await SaleService.validate({
      saleId: draft1.id, organizationId, userId,
      payments: [{ method: 'cash', amount: 50 }],
    });

    expect(issued.gift_cards_issued).toHaveLength(1);
    const giftCard = issued.gift_cards_issued[0]!;
    expect(giftCard.amount).toBe(50);

    // La vente elle-même reste inchangée (total_ttc = 50, montant réellement
    // encaissé) — seule la CLASSIFICATION « CA » de la ligne change.
    const sale1 = await query<{ total_ttc: string }>(`SELECT total_ttc::text FROM sales WHERE id = $1`, [draft1.id]);
    expect(Number(sale1.rows[0]!.total_ttc)).toBe(50);

    const line1 = await query<{ metadata: { gift_card_ca_deferred?: boolean } }>(
      `SELECT metadata FROM sale_lines WHERE sale_id = $1 AND line_index = 0`, [draft1.id],
    );
    expect(line1.rows[0]!.metadata.gift_card_ca_deferred).toBe(true);

    const gcRow = await query<{ balance: string; status: string }>(
      `SELECT balance::text, status FROM gift_cards WHERE id = $1`, [giftCard.id],
    );
    expect(Number(gcRow.rows[0]!.balance)).toBe(50);
    expect(gcRow.rows[0]!.status).toBe('active');

    const issueMovement = await query<{ movement_type: string; amount_delta: string }>(
      `SELECT movement_type, amount_delta::text FROM gift_card_movements WHERE gift_card_id = $1`, [giftCard.id],
    );
    expect(issueMovement.rows[0]!.movement_type).toBe('issue');
    expect(Number(issueMovement.rows[0]!.amount_delta)).toBe(50);

    // Rapport X (en direct) après l'émission seule : CA = 0, encaissement
    // "vente de cartes cadeaux" = 50, paiement espèces = 50.
    const reportAfterIssuance = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(reportAfterIssuance.totals.ca_ttc).toBe(0);
    expect(reportAfterIssuance.encaissements_hors_ca.gift_card_sales_ttc).toBe(50);
    expect(reportAfterIssuance.payments.find((p) => p.method === 'cash')?.amount).toBe(50);

    // 2. Achat ultérieur de produits pour 50 €, réglé INTÉGRALEMENT par la carte.
    const draft2 = await SaleService.createDraft({ organizationId, storeId, registerId, userId });
    await SaleService.setLines(draft2.id, organizationId, [{
      product_id: productId, label: 'Bouquet test', unit_price_ttc: 50, quantity: 1,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    await SaleService.validate({
      saleId: draft2.id, organizationId, userId,
      payments: [{ method: 'gift_card', amount: 50, reference: giftCard.code }],
    });

    const gcAfterUse = await query<{ balance: string; status: string }>(
      `SELECT balance::text, status FROM gift_cards WHERE id = $1`, [giftCard.id],
    );
    expect(Number(gcAfterUse.rows[0]!.balance)).toBe(0);
    expect(gcAfterUse.rows[0]!.status).toBe('used');

    const useMovement = await query<{ movement_type: string; amount_delta: string }>(
      `SELECT movement_type, amount_delta::text FROM gift_card_movements
        WHERE gift_card_id = $1 AND movement_type = 'use'`, [giftCard.id],
    );
    expect(Number(useMovement.rows[0]!.amount_delta)).toBe(-50);

    // Rapport X après les deux ventes : CA cumulé = 50 (pas 100), ticket_count = 2,
    // paiement par carte cadeau visible séparément, AUCUN nouvel encaissement
    // "espèces/CB" créé au moment de l'utilisation.
    const finalReport = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(finalReport.totals.ca_ttc).toBe(50);
    expect(finalReport.totals.ticket_count).toBe(2);
    expect(finalReport.payments.find((p) => p.method === 'gift_card')?.amount).toBe(50);
    expect(finalReport.payments.find((p) => p.method === 'cash')?.amount).toBe(50);
    // Le cumul espèces (encaissement bancaire/caisse réel) n'a pas bougé
    // entre les deux rapports : aucun nouvel encaissement à l'utilisation.
    expect(finalReport.payments.find((p) => p.method === 'cash')?.amount)
      .toBe(reportAfterIssuance.payments.find((p) => p.method === 'cash')?.amount);

    await CashSessionService.close({
      organizationId, sessionId: openSession.id, userId, countedCash: 150,
    });
  });

  it('la clôture Z (ClosingService.sealDaily) applique la même exclusion CA', async () => {
    // Boutique dédiée : isole cette clôture des ventes du test précédent
    // (même organisation, même journée) pour un total_ttc prévisible.
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T4', 'Boutique Clôture') RETURNING id`,
      [organizationId],
    );
    const zStoreId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R4', 'Caisse 4') RETURNING id`,
      [organizationId, zStoreId],
    );
    const zRegisterId = register.rows[0]!.id;

    await CashSessionService.open({
      organizationId, storeId: zStoreId, registerId: zRegisterId, userId, openingFloat: 0,
    });

    const draft = await SaleService.createDraft({ organizationId, storeId: zStoreId, registerId: zRegisterId, userId });
    await SaleService.setLines(draft.id, organizationId, [{
      label: 'Carte cadeau', unit_price_ttc: 30, quantity: 1, tax_rate: 0, tax_rate_code: 'CADEAU',
      metadata: { gift_card: true },
    }]);
    await SaleService.validate({
      saleId: draft.id, organizationId, userId,
      payments: [{ method: 'cash', amount: 30 }],
    });

    const sealed = await ClosingService.sealDaily({
      organizationId, storeId: zStoreId, userId, businessDate, countedCash: 30,
    });

    // Le total_ttc du Z (CA) exclut les 30 € de la carte émise ce jour-là ;
    // le cash_expected (réconciliation tiroir), lui, les inclut normalement
    // (c'est un vrai encaissement espèces).
    expect(sealed.totals.total_ttc).toBe(0);
    expect(sealed.totals.cash_expected).toBe(30);

    // La clôture, une fois scellée, est immuable (trigger append-only) :
    // vérifie qu'aucune tentative de la modifier ne passe.
    await expect(
      query(`UPDATE daily_closures SET total_ttc = 999 WHERE id = $1`, [sealed.daily_closure_id]),
    ).rejects.toThrow();
  });

  it('file d\'attente (pending_store_operations) : encaissement sans session ouverte, affecté à la session suivante, paid_at conservé', async () => {
    // Boutique dédiée à ce test (aucune session ouverte au départ).
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T2', 'Boutique Fermée') RETURNING id`,
      [organizationId],
    );
    const closedStoreId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R2', 'Caisse 2') RETURNING id`,
      [organizationId, closedStoreId],
    );

    const occurredAt = '2026-09-27T15:00:00.000Z'; // dimanche, boutique fermée
    const sourceId = randomUUID();
    const created = await createPendingStoreOperation({
      organizationId, storeId: closedStoreId, kind: 'online_gift_card',
      amountCents: 5000, currency: 'eur', paymentLabel: 'Carte cadeau en ligne / Stripe',
      occurredAt, sourceType: 'online_gift_card_order', sourceId,
    });
    expect(created.cashSessionId).toBeNull();

    const pendingRow = await query<{ cash_session_id: string | null; occurred_at: string }>(
      `SELECT cash_session_id, occurred_at FROM pending_store_operations WHERE id = $1`, [created.id],
    );
    expect(pendingRow.rows[0]!.cash_session_id).toBeNull();
    expect(new Date(pendingRow.rows[0]!.occurred_at).toISOString()).toBe(occurredAt);

    // Idempotence : rejouer la même source ne crée pas de seconde ligne.
    const replay = await createPendingStoreOperation({
      organizationId, storeId: closedStoreId, kind: 'online_gift_card',
      amountCents: 5000, currency: 'eur', paymentLabel: 'Carte cadeau en ligne / Stripe',
      occurredAt, sourceType: 'online_gift_card_order', sourceId,
    });
    expect(replay.id).toBe(created.id);
    const countRows = await query<{ n: string }>(
      `SELECT COUNT(*)::text n FROM pending_store_operations WHERE source_id = $1`, [sourceId],
    );
    expect(countRows.rows[0]!.n).toBe('1');

    // Ouverture suivante de la boutique : l'opération en attente est
    // automatiquement rattachée, SANS modifier occurred_at.
    const opened = await CashSessionService.open({
      organizationId, storeId: closedStoreId, registerId: register.rows[0]!.id, userId, openingFloat: 0,
    });
    const afterOpen = await query<{ cash_session_id: string | null; occurred_at: string }>(
      `SELECT cash_session_id, occurred_at FROM pending_store_operations WHERE id = $1`, [created.id],
    );
    expect(afterOpen.rows[0]!.cash_session_id).toBe(opened.id);
    expect(new Date(afterOpen.rows[0]!.occurred_at).toISOString()).toBe(occurredAt);
  });

  it('file d\'attente : rattachement IMMÉDIAT quand une session est déjà ouverte au moment du paiement', async () => {
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T3', 'Boutique Ouverte') RETURNING id`,
      [organizationId],
    );
    const openStoreId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R3', 'Caisse 3') RETURNING id`,
      [organizationId, openStoreId],
    );
    const session = await CashSessionService.open({
      organizationId, storeId: openStoreId, registerId: register.rows[0]!.id, userId, openingFloat: 0,
    });

    const created = await createPendingStoreOperation({
      organizationId, storeId: openStoreId, kind: 'online_gift_card',
      amountCents: 2500, currency: 'eur', paymentLabel: 'Carte cadeau en ligne / Stripe',
      occurredAt: new Date().toISOString(), sourceType: 'online_gift_card_order', sourceId: randomUUID(),
    });
    expect(created.cashSessionId).toBe(session.id);
  });
});
