// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { query, pool } from '@/lib/db/client';
import { InvoiceService } from '@/lib/services/invoice-service';

describe('UI — message clair pour SALE_ALREADY_INVOICED (pas le code brut affiché au caissier)', () => {
  it('ReceiptPreviewModal.tsx traduit SALE_ALREADY_INVOICED', () => {
    const src = readFileSync('app/(app)/caisse/ReceiptPreviewModal.tsx', 'utf8');
    expect(src).toMatch(/case 'SALE_ALREADY_INVOICED': return 'Ce ticket est déjà inclus dans une facture de période\.';/);
  });

  it('MaJourneeClient.tsx traduit SALE_ALREADY_INVOICED', () => {
    const src = readFileSync('app/(app)/ma-journee/MaJourneeClient.tsx', 'utf8');
    expect(src).toMatch(/j\.error === 'SALE_ALREADY_INVOICED' \? 'Ce ticket est déjà inclus dans une facture de période\.'/);
  });

  it('la route sales/:id/invoice mappe SALE_ALREADY_INVOICED sur 409', () => {
    const src = readFileSync('app/api/sales/[id]/invoice/route.ts', 'utf8');
    expect(src).toMatch(/msg === 'SALE_ALREADY_INVOICED' \? 409 :/);
  });
});

/**
 * Bug remonté : un ticket déjà facturé individuellement (depuis Ma
 * journée/caisse — createFromSale, qui pose invoices.sale_id) restait
 * sélectionnable dans « Tickets en compte à facturer » de la page
 * Facturation, prêt à être regroupé dans une facture de PÉRIODE
 * (createFromAccountSales) — doublant la facturation du même ticket
 * (cas réel : Conseil départemental, ticket de 74,25 € déjà facturé et
 * envoyé, encore coché pour « Facturer la période »).
 *
 * Chaque chemin de facturation se protégeait contre lui-même
 * (createFromSale refusait une 2e facture individuelle ; createFromAccountSales
 * refusait d'inclure une vente déjà en facture de période via
 * account_invoice_id) mais pas contre l'AUTRE chemin. Corrigé dans les deux
 * sens ici, plus le filtre des requêtes qui listent les tickets « à
 * facturer » (app/api/billing/customers[/[id]]/route.ts).
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Anti-doublon facturation : les deux chemins se protègent mutuellement', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let customerId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test No Double Billing ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1,$2,'R1','Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `no-double-bill-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, company_name) VALUES ($1, 'Conseil départemental test') RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeDeferredSale(): Promise<string> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
         total_ht, total_tva, total_ttc, tva_breakdown, validated_at, receipt_number)
       VALUES ($1,$2,$3,$4,$5,'validated', 61.88, 12.37, 74.25, $6, now(), $7) RETURNING id`,
      [
        organizationId, storeId, registerId, userId, customerId,
        JSON.stringify([{ rate: 20, base_ht: 61.88, tva: 12.37, ttc: 74.25 }]),
        `R-${randomUUID().slice(0, 8)}`,
      ],
    );
    const saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
         discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1,$2,0,'Composition florale',74.25,1,0,20,'TVA20',61.88,12.37,74.25)`,
      [organizationId, saleId],
    );
    await query(
      `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES ($1,$2,'deferred',74.25)`,
      [organizationId, saleId],
    );
    return saleId;
  }

  it('un ticket déjà facturé INDIVIDUELLEMENT (createFromSale) ne peut plus être regroupé dans une facture de période', async () => {
    const saleId = await makeDeferredSale();
    await InvoiceService.createFromSale({ organizationId, userId, saleId, customerId });

    await expect(
      InvoiceService.createFromAccountSales({ organizationId, userId, customerId, saleIds: [saleId] }),
    ).rejects.toThrow('SALE_ALREADY_INVOICED');
  });

  it('un ticket déjà inclus dans une facture de PÉRIODE (createFromAccountSales) ne peut plus être facturé individuellement', async () => {
    const saleId = await makeDeferredSale();
    await InvoiceService.createFromAccountSales({ organizationId, userId, customerId, saleIds: [saleId] });

    await expect(
      InvoiceService.createFromSale({ organizationId, userId, saleId, customerId }),
    ).rejects.toThrow('SALE_ALREADY_INVOICED');
  });

  it('un ticket facturé individuellement disparaît de « Tickets en compte à facturer » (API Facturation, détail client)', async () => {
    const saleId = await makeDeferredSale();

    const before = await query<{ id: string }>(
      `SELECT s.id FROM sales s
        WHERE s.customer_id = $1 AND s.organization_id = $2 AND s.status = 'validated'
          AND s.account_invoice_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.sale_id = s.id AND i.status <> 'cancelled')
          AND EXISTS (SELECT 1 FROM payments p WHERE p.sale_id = s.id AND p.method = 'deferred')`,
      [customerId, organizationId],
    );
    expect(before.rows.some((r) => r.id === saleId)).toBe(true);

    await InvoiceService.createFromSale({ organizationId, userId, saleId, customerId });

    const after = await query<{ id: string }>(
      `SELECT s.id FROM sales s
        WHERE s.customer_id = $1 AND s.organization_id = $2 AND s.status = 'validated'
          AND s.account_invoice_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.sale_id = s.id AND i.status <> 'cancelled')
          AND EXISTS (SELECT 1 FROM payments p WHERE p.sale_id = s.id AND p.method = 'deferred')`,
      [customerId, organizationId],
    );
    expect(after.rows.some((r) => r.id === saleId)).toBe(false);
  });

  it('un ticket annulé (avoir) redevient facturable (le filtre ignore les factures status=cancelled)', async () => {
    const saleId = await makeDeferredSale();
    const inv = await InvoiceService.createFromSale({ organizationId, userId, saleId, customerId });
    await query(`UPDATE invoices SET status = 'cancelled' WHERE id = $1`, [inv.invoice_id]);

    // Ne doit plus être bloqué : la facture annulée ne compte pas.
    await expect(
      InvoiceService.createFromAccountSales({ organizationId, userId, customerId, saleIds: [saleId] }),
    ).resolves.toMatchObject({ total_ttc: 74.25 });
  });
});
