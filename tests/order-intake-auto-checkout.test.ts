import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { createIncomingOrder } from '@/lib/services/order-intake';
import { computeDayReport } from '@/lib/services/day-report';

/**
 * Encaissement automatique des commandes WEB/OGF (Paramètres → Modes de
 * règlement → « Commandes automatiques ») : une commande reçue avec cette
 * source est encaissée IMMÉDIATEMENT sur la caisse virtuelle (toujours
 * ouverte), avec le mode de règlement par défaut configuré — même si AUCUNE
 * caisse réelle n'est ouverte pour la boutique. Sans ce réglage (comportement
 * historique), la commande reste "en attente".
 *
 * Intégration contre une vraie base Postgres.
 */
describe('order-intake — encaissement automatique (caisse virtuelle)', () => {
  let organizationId: string;
  let storeId: string;
  let businessDate: string;
  let cardMethodId: string;
  let cashMethodId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Auto Checkout ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'AC', 'Auto Checkout') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;

    // Une caisse réelle existe (placeholder normalement utilisé par les
    // commandes qui ne s'auto-encaissent pas) mais n'a AUCUNE session
    // ouverte — simule une boutique fermée.
    await query(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse')`,
      [organizationId, storeId],
    );
    await query(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner')`,
      [organizationId, `ac-${randomUUID()}@example.test`],
    );
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );

    const card = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, is_active)
       VALUES ($1, 'card', 'card', 'Carte bancaire', TRUE) RETURNING id`,
      [organizationId],
    );
    cardMethodId = card.rows[0]!.id;
    const cash = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, is_active)
       VALUES ($1, 'cash', 'cash', 'Espèces', TRUE) RETURNING id`,
      [organizationId],
    );
    cashMethodId = cash.rows[0]!.id;

    businessDate = new Date().toISOString().slice(0, 10);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function setAutoCheckout(settings: { enabled: boolean; web?: string | null; ogf?: string | null }) {
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'order_auto_checkout', $2::jsonb)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [organizationId, JSON.stringify({
        enabled: settings.enabled,
        web_payment_method_id: settings.web ?? null,
        ogf_payment_method_id: settings.ogf ?? null,
      })],
    );
  }

  it("SANS réglage activé (par défaut) : une commande WEB reste en attente, comportement inchangé", async () => {
    await setAutoCheckout({ enabled: false });
    const out = await createIncomingOrder({
      organizationId, storeId, externalRef: `web-${randomUUID()}`, boutiqueLabel: 'Boutique',
      source: 'WEB', lines: [{ label: 'Bouquet', amount_ttc: 25 }],
    });
    expect(out.status).toBe('on_hold');
    const row = await query<{ status: string; cash_session_id: string | null }>(
      `SELECT status, cash_session_id FROM sales WHERE id = $1`, [out.id],
    );
    expect(row.rows[0]).toMatchObject({ status: 'on_hold', cash_session_id: null });
  });

  it("réglage activé : une commande WEB est encaissée immédiatement, avec le mode de règlement configuré", async () => {
    await setAutoCheckout({ enabled: true, web: cardMethodId });
    const out = await createIncomingOrder({
      organizationId, storeId, externalRef: `web-${randomUUID()}`, boutiqueLabel: 'Boutique',
      source: 'WEB', lines: [{ label: 'Bouquet', amount_ttc: 36 }],
    });
    expect(out.status).toBe('validated');

    const row = await query<{
      status: string; total_ttc: string; register_id: string;
    }>(`SELECT status, total_ttc, register_id FROM sales WHERE id = $1`, [out.id]);
    expect(row.rows[0]!.status).toBe('validated');
    expect(Number(row.rows[0]!.total_ttc)).toBe(36);

    const reg = await query<{ is_virtual: boolean }>(
      `SELECT is_virtual FROM registers WHERE id = $1`, [row.rows[0]!.register_id],
    );
    expect(reg.rows[0]!.is_virtual).toBe(true);

    const payment = await query<{ method: string; label: string; amount: string }>(
      `SELECT method, label, amount::text FROM payments WHERE sale_id = $1`, [out.id],
    );
    expect(payment.rows[0]!.method).toBe('card');
    expect(payment.rows[0]!.label).toBe('Carte bancaire');
    expect(Number(payment.rows[0]!.amount)).toBe(36);
  });

  it("une boutique SANS AUCUNE caisse réelle ouverte voit quand même son CA du jour inclure la vente auto-encaissée", async () => {
    await setAutoCheckout({ enabled: true, web: cardMethodId });
    const before = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    const caAvant = before.totals.ca_ttc;

    await createIncomingOrder({
      organizationId, storeId, externalRef: `web-${randomUUID()}`, boutiqueLabel: 'Boutique',
      source: 'WEB', lines: [{ label: 'Bouquet', amount_ttc: 50 }],
    });

    const after = await computeDayReport({
      organizationId, storeId, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(after.totals.ca_ttc).toBeCloseTo(caAvant + 50, 2);
  });

  it("source OGF : encaissée automatiquement SUR LE COMPTE CLIENT OGF, avec sa remise systématique déjà appliquée", async () => {
    await query(
      `INSERT INTO customers (organization_id, type, company_name, default_discount_pct)
       VALUES ($1, 'professionnel', 'OGF Services Financiers', 20)
       ON CONFLICT DO NOTHING`,
      [organizationId],
    );
    const deferred = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, is_active)
       VALUES ($1, 'deferred', 'deferred', 'Différé client', TRUE) RETURNING id`,
      [organizationId],
    );
    await setAutoCheckout({ enabled: true, web: cardMethodId, ogf: deferred.rows[0]!.id });

    const out = await createIncomingOrder({
      organizationId, storeId, externalRef: `ogf-${randomUUID()}`, boutiqueLabel: 'Boutique',
      subtype: 'ogf', source: 'OGF', lines: [{ label: 'Composition deuil', amount_ttc: 100 }],
    });
    expect(out.status).toBe('validated');

    const sale = await query<{ customer_id: string | null; total_ttc: string }>(
      `SELECT customer_id, total_ttc::text FROM sales WHERE id = $1`, [out.id],
    );
    expect(sale.rows[0]!.customer_id).toBeTruthy();
    expect(Number(sale.rows[0]!.total_ttc)).toBe(80); // 100 - 20% de remise OGF

    const payment = await query<{ method: string }>(
      `SELECT method FROM payments WHERE sale_id = $1`, [out.id],
    );
    expect(payment.rows[0]!.method).toBe('deferred');
  });

  it("mode de règlement désactivé entre-temps : repli silencieux, la commande reste en attente (jamais d'échec de réception)", async () => {
    await query(`UPDATE payment_methods SET is_active = FALSE WHERE id = $1`, [cashMethodId]);
    await setAutoCheckout({ enabled: true, web: cashMethodId });

    const out = await createIncomingOrder({
      organizationId, storeId, externalRef: `web-${randomUUID()}`, boutiqueLabel: 'Boutique',
      source: 'WEB', lines: [{ label: 'Bouquet', amount_ttc: 15 }],
    });
    expect(out.status).toBe('on_hold');
    const row = await query<{ status: string }>(`SELECT status FROM sales WHERE id = $1`, [out.id]);
    expect(row.rows[0]!.status).toBe('on_hold');
  });
});
