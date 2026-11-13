// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { SaleService } from '@/lib/services/sale-service';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { ClosingService } from '@/lib/services/closing-service';
import { enqueueAutoWithdrawalPrint } from '@/lib/services/cloudprnt/print-report';
import { buildAutoWithdrawalStarPrnt } from '@/lib/services/cloudprnt/receipt-star';

/**
 * Ticket de prélèvement AUTOMATIQUE à la clôture : ne se déclenche que quand
 * le fond de caisse est fixe, qu'un surplus existe, qu'aucun prélèvement
 * réel n'a déjà été enregistré ce jour, que le réglage est activé (Gestion
 * argent), et que le Z ne s'imprime pas lui-même automatiquement (il montre
 * déjà ce surplus — voir lib/settings/receipt.ts auto_print_z).
 */
const hasDb = !!process.env.DATABASE_URL;

describe('buildAutoWithdrawalStarPrnt — contenu du ticket', () => {
  it("en-tête réduit au nom de la boutique (pas d'adresse ni de SIRET) et affiche les bons champs", async () => {
    const buf = await buildAutoWithdrawalStarPrnt({
      closure_id: 'abcdef12-0000-0000-0000-000000000000',
      store_name: 'Paris XIe',
      closed_by: 'Camille',
      closed_at: '2026-11-13T18:00:00Z',
      cash_before: 212.40,
      target_float: 150,
      amount: 62.40,
      org_name: 'Atelier Sauge',
    }, {
      shop_name: 'Atelier Sauge', address_line1: '12 rue des Lilas',
      address_zip_city: '75011 Paris', siret: '123 456 789 00012',
    } as any, 80, null);
    const text = buf.toString('latin1');

    // Le nom de la boutique est rendu en bitmap (printShopName), pas en texte
    // brut — non vérifiable ici ; seule la ligne "Boutique" (texte) l'est.
    expect(text).toContain('PRELEVEMENT AUTOMATIQUE');
    expect(text).toContain('Paris XIe');
    expect(text).toContain('Camille');
    expect(text).toContain('212,40 EUR');
    expect(text).toContain('150,00 EUR');
    expect(text).toContain('62,40 EUR');
    expect(text).toContain('Reference abcdef12');

    // En-tête réduit : ni adresse ni SIRET, contrairement au ticket de
    // prélèvement MANUEL (buildBankDepositStarPrnt) — ce n'est pas un
    // justificatif fiscal.
    expect(text).not.toContain('rue des Lilas');
    expect(text).not.toContain('SIRET');
  });
});

describe.skipIf(!hasDb)('enqueueAutoWithdrawalPrint — déclenchement à la clôture', () => {
  let organizationId: string;
  let userId: string;
  let productId: string;
  let businessDate: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Auto Withdrawal ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `caw-${randomUUID()}@example.test`],
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

  async function setSetting(key: string, storeId: string, value: unknown): Promise<void> {
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [organizationId, `${key}:${storeId}`, JSON.stringify(value)],
    );
  }

  async function fixedFloatStoreWithSurplus(code: string): Promise<{ storeId: string; closureId: string }> {
    const { storeId, registerId } = await makeStore(code);
    await setSetting('opening_float', storeId, { mode: 'fixed', amount: 100 });
    await setSetting('cash', storeId, { print_auto_withdrawal_receipt: true });
    await setSetting('receipt', storeId, { auto_print_z: false });
    await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 100 });

    const draft = await SaleService.createDraft({ organizationId, storeId, registerId, userId });
    await SaleService.setLines(draft.id, organizationId, [{
      product_id: productId, label: 'Bouquet test', unit_price_ttc: 70, quantity: 1,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    await SaleService.validate({
      saleId: draft.id, organizationId, userId,
      payments: [{ method: 'cash', amount: 70, label: 'Espèces' }],
    });

    const sealed = await ClosingService.sealDaily({
      organizationId, storeId, userId, businessDate,
    });
    return { storeId, closureId: sealed.daily_closure_id };
  }

  it("pas d'imprimante CloudPRNT configurée -> NO_PRINTER", async () => {
    const { closureId } = await fixedFloatStoreWithSurplus('CAW1');
    const r = await enqueueAutoWithdrawalPrint({ organizationId, userId, closureId });
    expect(r).toEqual({ printed: false, reason: 'NO_PRINTER' });
  });

  it('réglage désactivé (print_auto_withdrawal_receipt=false) -> DISABLED, même avec imprimante', async () => {
    const { storeId, closureId } = await fixedFloatStoreWithSurplus('CAW2');
    await setSetting('cash', storeId, { print_auto_withdrawal_receipt: false });
    await query(
      `INSERT INTO cloudprnt_printers (organization_id, store_id, mac, label, role)
       VALUES ($1, $2, $3, 'Imprimante ticket', 'receipt')`,
      [organizationId, storeId, `aa:bb:cc:${randomUUID().slice(0, 8)}`],
    );
    const r = await enqueueAutoWithdrawalPrint({ organizationId, userId, closureId });
    expect(r).toEqual({ printed: false, reason: 'DISABLED' });
  });

  it('le Z s\'imprime déjà automatiquement -> Z_AUTO_PRINT_ON (il montre déjà le surplus)', async () => {
    const { storeId, closureId } = await fixedFloatStoreWithSurplus('CAW3');
    await setSetting('receipt', storeId, { auto_print_z: true });
    await query(
      `INSERT INTO cloudprnt_printers (organization_id, store_id, mac, label, role)
       VALUES ($1, $2, $3, 'Imprimante ticket', 'receipt')`,
      [organizationId, storeId, `aa:bb:cc:${randomUUID().slice(0, 8)}`],
    );
    const r = await enqueueAutoWithdrawalPrint({ organizationId, userId, closureId });
    expect(r).toEqual({ printed: false, reason: 'Z_AUTO_PRINT_ON' });
  });

  it('fond de caisse manuel (pas de surplus automatique) -> NOT_APPLICABLE', async () => {
    const { storeId, registerId } = await makeStore('CAW4');
    await setSetting('cash', storeId, { print_auto_withdrawal_receipt: true });
    await setSetting('receipt', storeId, { auto_print_z: false });
    await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 100 });
    await query(
      `INSERT INTO cloudprnt_printers (organization_id, store_id, mac, label, role)
       VALUES ($1, $2, $3, 'Imprimante ticket', 'receipt')`,
      [organizationId, storeId, `aa:bb:cc:${randomUUID().slice(0, 8)}`],
    );
    const sealed = await ClosingService.sealDaily({ organizationId, storeId, userId, businessDate });
    const r = await enqueueAutoWithdrawalPrint({ organizationId, userId, closureId: sealed.daily_closure_id });
    expect(r).toEqual({ printed: false, reason: 'NOT_APPLICABLE' });
  });

  it('un prélèvement réel a déjà été enregistré ce jour -> NOT_APPLICABLE (déjà reçu à l\'écran)', async () => {
    const { storeId, registerId } = await makeStore('CAW5');
    await setSetting('opening_float', storeId, { mode: 'fixed', amount: 100 });
    await setSetting('cash', storeId, { print_auto_withdrawal_receipt: true });
    await setSetting('receipt', storeId, { auto_print_z: false });
    const session = await CashSessionService.open({ organizationId, storeId, registerId, userId, openingFloat: 100 });

    const draft = await SaleService.createDraft({ organizationId, storeId, registerId, userId });
    await SaleService.setLines(draft.id, organizationId, [{
      product_id: productId, label: 'Bouquet test', unit_price_ttc: 70, quantity: 1,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    await SaleService.validate({
      saleId: draft.id, organizationId, userId,
      payments: [{ method: 'cash', amount: 70, label: 'Espèces' }],
    });
    await query(
      `INSERT INTO cash_movements (organization_id, cash_session_id, movement_type, amount, reason, user_id)
       VALUES ($1, $2, 'out', 70, 'Prélèvement', $3)`,
      [organizationId, session.id, userId],
    );
    await query(
      `INSERT INTO cloudprnt_printers (organization_id, store_id, mac, label, role)
       VALUES ($1, $2, $3, 'Imprimante ticket', 'receipt')`,
      [organizationId, storeId, `aa:bb:cc:${randomUUID().slice(0, 8)}`],
    );
    const sealed = await ClosingService.sealDaily({ organizationId, storeId, userId, businessDate });
    const r = await enqueueAutoWithdrawalPrint({ organizationId, userId, closureId: sealed.daily_closure_id });
    expect(r).toEqual({ printed: false, reason: 'NOT_APPLICABLE' });
  });

  it('toutes les conditions réunies -> imprimé, job en file avec le bon titre', async () => {
    const { storeId, closureId } = await fixedFloatStoreWithSurplus('CAW6');
    const printer = await query<{ id: string }>(
      `INSERT INTO cloudprnt_printers (organization_id, store_id, mac, label, role)
       VALUES ($1, $2, $3, 'Imprimante ticket', 'receipt') RETURNING id`,
      [organizationId, storeId, `aa:bb:cc:${randomUUID().slice(0, 8)}`],
    );

    const r = await enqueueAutoWithdrawalPrint({ organizationId, userId, closureId });
    expect(r).toEqual({ printed: true });

    const jobs = await query<{ title: string; content_type: string }>(
      `SELECT title, content_type FROM cloudprnt_jobs WHERE printer_id = $1`,
      [printer.rows[0]!.id],
    );
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]!.title).toContain('Prelevement automatique');
  });
});
