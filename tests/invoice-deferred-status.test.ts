// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { InvoiceService } from '@/lib/services/invoice-service';

/**
 * Facturer une vente « en compte » (payée en mode différé) marquait la
 * facture 'paid' dès sa création, au même titre qu'une vente réellement
 * encaissée — elle s'affichait donc « FACTURE ACQUITTÉE » alors que le
 * client n'a pas encore réglé. Seule la facture de PÉRIODE
 * (createFromAccountSales, qui regroupe plusieurs ventes en compte) partait
 * déjà correctement en statut 'sent'. Ce fichier couvre l'autre chemin,
 * createFromSale (facturation d'une seule vente), qui ignorait le mode de
 * règlement de la vente.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Facturation d\'une vente : statut selon le mode de règlement', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let customerId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Invoice Deferred ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'ID', 'Test Store') RETURNING id`,
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
      [organizationId, `inv-deferred-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name)
       VALUES ($1, 'particulier', 'Jeanne', 'Client') RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeSale(method: 'card' | 'deferred' | 'mixed'): Promise<string> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
         validated_at, total_ttc, total_ht, total_tva, receipt_number)
       VALUES ($1, $2, $3, $4, $5, 'validated', now(), 60, 54.55, 5.45, $6) RETURNING id`,
      [organizationId, storeId, registerId, userId, customerId, `T-INV-${randomUUID().slice(0, 8)}`],
    );
    const saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Bouquet', 60, 1, 10, 'TVA10', 54.55, 5.45, 60)`,
      [organizationId, saleId],
    );
    if (method === 'card') {
      await query(
        `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1, $2, 'card', 60)`,
        [organizationId, saleId],
      );
    } else if (method === 'deferred') {
      await query(
        `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1, $2, 'deferred', 60)`,
        [organizationId, saleId],
      );
    } else {
      await query(
        `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1, $2, 'card', 20)`,
        [organizationId, saleId],
      );
      await query(
        `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1, $2, 'deferred', 40)`,
        [organizationId, saleId],
      );
    }
    return saleId;
  }

  it('vente réglée par carte : facture créée "payée"', async () => {
    const saleId = await makeSale('card');
    const out = await InvoiceService.createFromSale({ organizationId, userId, saleId });
    const row = await query<{ status: string; paid_at: string | null }>(
      `SELECT status, paid_at FROM invoices WHERE id = $1`, [out.invoice_id],
    );
    expect(row.rows[0]!.status).toBe('paid');
    expect(row.rows[0]!.paid_at).not.toBeNull();
  });

  it('vente mise "en compte" : facture créée "envoyée", pas acquittée', async () => {
    const saleId = await makeSale('deferred');
    const out = await InvoiceService.createFromSale({ organizationId, userId, saleId });
    const row = await query<{ status: string; paid_at: string | null }>(
      `SELECT status, paid_at FROM invoices WHERE id = $1`, [out.invoice_id],
    );
    expect(row.rows[0]!.status).toBe('sent');
    expect(row.rows[0]!.paid_at).toBeNull();
  });

  it('vente réglée en partie en compte : facture pas acquittée non plus', async () => {
    const saleId = await makeSale('mixed');
    const out = await InvoiceService.createFromSale({ organizationId, userId, saleId });
    const row = await query<{ status: string; paid_at: string | null }>(
      `SELECT status, paid_at FROM invoices WHERE id = $1`, [out.invoice_id],
    );
    expect(row.rows[0]!.status).toBe('sent');
    expect(row.rows[0]!.paid_at).toBeNull();
  });
});
