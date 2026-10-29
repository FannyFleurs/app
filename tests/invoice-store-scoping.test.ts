// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { InvoiceService } from '@/lib/services/invoice-service';
import { buildInvoicePdf } from '@/lib/services/pdf-builders';
import { loadInvoiceSettings } from '@/lib/settings/invoice-server';
import { runMonthlyBillingForOrg } from '@/lib/services/monthly-billing';

/**
 * Une facture de PÉRIODE (createFromAccountSales — « Facturation » en BO)
 * porte l'en-tête et le RIB d'UNE boutique (paramétrage par boutique). Tant
 * que tous les tickets regroupés viennent de la même boutique, elle affiche
 * exactement le même RIB qu'une facture générée directement depuis une vente
 * (createFromSale) de cette boutique — vérifié ici en comparant les réglages
 * effectivement résolus pour les deux factures, et en confirmant que le PDF
 * se génère bien dans les deux cas.
 *
 * Si les tickets sélectionnés viennent de boutiques différentes, l'identité
 * (et donc le RIB) de la facture serait arbitraire — refusé explicitement
 * (STORE_MISMATCH) plutôt que silencieusement incohérent. La facturation
 * mensuelle automatique (runMonthlyBillingForOrg) ne peut donc jamais
 * déclencher ce refus : elle scinde elle-même par boutique en amont.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Facturation de période — cohérence boutique/RIB', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let registerAId: string;
  let registerBId: string;
  let userId: string;
  let customerId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Invoice Store Scoping ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'B', 'Boutique B') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;
    const registerA = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1,$2,'R-A','Caisse A') RETURNING id`,
      [organizationId, storeAId],
    );
    registerAId = registerA.rows[0]!.id;
    const registerB = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1,$2,'R-B','Caisse B') RETURNING id`,
      [organizationId, storeBId],
    );
    registerBId = registerB.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `rib-scope-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name, billing_frequency)
       VALUES ($1, 'Jean', 'Dupont', 'monthly') RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
    // RIB configuré UNIQUEMENT pour la boutique A — la boutique B n'en a pas.
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3)`,
      [organizationId, `invoice:${storeAId}`, JSON.stringify({
        show_bank_details: true, bank_holder: 'HelloPos SAS', bank_name: 'Banque Test',
        bank_iban: 'FR7630006000011234567890189', bank_bic: 'BNPAFRPP', default_payment_terms: 'net_30',
      })],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeSale(storeId: string, registerId: string, deferred: boolean): Promise<string> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
         total_ht, total_tva, total_ttc, tva_breakdown, validated_at)
       VALUES ($1,$2,$3,$4,$5,'validated', 10, 2, 12, $6, now()) RETURNING id`,
      [organizationId, storeId, registerId, userId, customerId, JSON.stringify([{ rate: 20, base_ht: 10, tva: 2, ttc: 12 }])],
    );
    const saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
         discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1,$2,0,'Bouquet test',12,1,0,20,'TVA20',10,2,12)`,
      [organizationId, saleId],
    );
    if (deferred) {
      await query(
        `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1,$2,'deferred',12)`,
        [organizationId, saleId],
      );
    }
    return saleId;
  }

  it('facture directe (createFromSale) et facture de période (createFromAccountSales) de la même boutique partagent exactement le même RIB', async () => {
    const directSaleId = await makeSale(storeAId, registerAId, false);
    const accountSaleId = await makeSale(storeAId, registerAId, false);

    const direct = await InvoiceService.createFromSale({ organizationId, userId, saleId: directSaleId, customerId });
    const account = await InvoiceService.createFromAccountSales({ organizationId, userId, customerId, saleIds: [accountSaleId] });

    const rows = await query<{ id: string; store_id: string }>(
      `SELECT id, store_id FROM invoices WHERE id = ANY($1::uuid[])`,
      [[direct.invoice_id, account.invoice_id]],
    );
    const byId = new Map(rows.rows.map((r) => [r.id, r.store_id]));
    expect(byId.get(direct.invoice_id)).toBe(storeAId);
    expect(byId.get(account.invoice_id)).toBe(storeAId);

    const settingsDirect = await loadInvoiceSettings(organizationId, byId.get(direct.invoice_id));
    const settingsAccount = await loadInvoiceSettings(organizationId, byId.get(account.invoice_id));
    expect(settingsDirect).toEqual(settingsAccount);
    expect(settingsDirect.show_bank_details).toBe(true);
    expect(settingsDirect.bank_iban).toBe('FR7630006000011234567890189');

    const pdfDirect = await buildInvoicePdf(direct.invoice_id, organizationId);
    const pdfAccount = await buildInvoicePdf(account.invoice_id, organizationId);
    expect(pdfDirect?.buffer.length).toBeGreaterThan(0);
    expect(pdfAccount?.buffer.length).toBeGreaterThan(0);
  });

  it('refuse de regrouper des tickets de boutiques différentes dans une même facture de période (STORE_MISMATCH)', async () => {
    const saleA = await makeSale(storeAId, registerAId, false);
    const saleB = await makeSale(storeBId, registerBId, false);

    await expect(
      InvoiceService.createFromAccountSales({ organizationId, userId, customerId, saleIds: [saleA, saleB] }),
    ).rejects.toThrow('STORE_MISMATCH');
  });

  it('la facturation mensuelle scinde automatiquement par boutique : un client avec des tickets dans 2 boutiques reçoit 2 factures', async () => {
    const saleA = await makeSale(storeAId, registerAId, true);
    const saleB = await makeSale(storeBId, registerBId, true);

    const result = await runMonthlyBillingForOrg(organizationId, userId);
    const forCustomer = result.generated.filter((g) => g.customer_id === customerId);
    expect(forCustomer.length).toBe(2);
    expect(result.skipped.some((s) => s.customer_id === customerId && s.reason === 'STORE_MISMATCH')).toBe(false);

    const invRows = await query<{ id: string; store_id: string }>(
      `SELECT id, store_id FROM invoices WHERE id = ANY($1::uuid[])`,
      [forCustomer.map((g) => g.invoice_id)],
    );
    const stores = new Set(invRows.rows.map((r) => r.store_id));
    expect(stores).toEqual(new Set([storeAId, storeBId]));

    // Vérifie que les ventes de chaque boutique ont bien été rattachées.
    const saleRows = await query<{ id: string; account_invoice_id: string | null }>(
      `SELECT id, account_invoice_id FROM sales WHERE id = ANY($1::uuid[])`,
      [[saleA, saleB]],
    );
    expect(saleRows.rows.every((r) => r.account_invoice_id !== null)).toBe(true);
  });
});
