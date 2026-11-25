// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { InvoiceService } from '@/lib/services/invoice-service';

/**
 * Une facture « en compte » soldée disparaissait entièrement de la page
 * Facturation (exclue de la requête des factures en attente), sans moyen de
 * la retrouver pour la réimprimer ou contrôler le règlement. Ce fichier
 * vérifie le nouveau bloc « Factures soldées » : la facture bascule de la
 * liste en attente vers la liste soldée, jamais dans les deux à la fois.
 *
 * Intégration contre une VRAIE base Postgres, même conventions que
 * tests/invoice-settle-reconciliation.test.ts.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: customerDetailRoute } = await import('@/app/api/billing/customers/[id]/route');

describe.skipIf(!hasDb)('Facturation — bascule des factures en attente vers soldées', () => {
  let organizationId: string;
  let storeId: string;
  let userId: string;
  let customerId: string;
  const DAY = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Billing Settled ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `bse-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name) VALUES ($1,'Jean','Dupont') RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  async function makeInvoice(amount: number, status: string): Promise<{ id: string; number: string }> {
    const number = `F-TEST-${randomUUID()}`;
    const inv = await query<{ id: string }>(
      `INSERT INTO invoices
         (organization_id, store_id, customer_id, invoice_type, number, sequence_value, status,
          issue_date, due_date, total_ht, total_tva, total_ttc, tva_breakdown,
          payment_terms, created_at)
       VALUES ($1,$2,$3,'standard',$4,1,$5,$6::date,$6::date,$7,0,$7,'[]'::jsonb,'À réception', $8::timestamptz)
       RETURNING id`,
      [organizationId, storeId, customerId, number, status, DAY, amount, `${DAY}T09:00:00Z`],
    );
    return { id: inv.rows[0]!.id, number };
  }

  function req(id: string): Request {
    return new Request(`https://x.test/api/billing/customers/${id}`);
  }

  it("une facture non soldée apparaît en attente, jamais dans les soldées", async () => {
    const inv = await makeInvoice(100, 'sent');
    const res = await customerDetailRoute(req(customerId), { params: { id: customerId } });
    const body = await res.json() as { invoices: Array<{ id: string }>; settled_invoices: Array<{ id: string }> };
    expect(body.invoices.map((i) => i.id)).toContain(inv.id);
    expect(body.settled_invoices.map((i) => i.id)).not.toContain(inv.id);
  });

  it("une fois soldée, la facture bascule vers « Factures soldées » avec le moyen de règlement, et quitte l'attente", async () => {
    const inv = await makeInvoice(200, 'sent');
    await InvoiceService.settleInvoice({
      organizationId, userId, invoiceId: inv.id, amount: 200, method: 'card',
    });

    const res = await customerDetailRoute(req(customerId), { params: { id: customerId } });
    const body = await res.json() as {
      invoices: Array<{ id: string }>;
      settled_invoices: Array<{ id: string; number: string | null; total_ttc: number; paid_at: string | null; payment_method: string | null }>;
    };

    expect(body.invoices.map((i) => i.id)).not.toContain(inv.id);

    const settled = body.settled_invoices.find((i) => i.id === inv.id);
    expect(settled).toBeTruthy();
    expect(settled!.number).toBe(inv.number);
    expect(settled!.total_ttc).toBe(200);
    expect(settled!.payment_method).toBe('card');
    expect(settled!.paid_at).toBeTruthy();
  });

  it("une facture annulée n'apparaît ni en attente ni en soldée", async () => {
    const inv = await makeInvoice(50, 'cancelled');
    const res = await customerDetailRoute(req(customerId), { params: { id: customerId } });
    const body = await res.json() as { invoices: Array<{ id: string }>; settled_invoices: Array<{ id: string }> };
    expect(body.invoices.map((i) => i.id)).not.toContain(inv.id);
    expect(body.settled_invoices.map((i) => i.id)).not.toContain(inv.id);
  });
});

describe("UI — bloc « Factures soldées » dans BillingManager.tsx", () => {
  // Gros composant client, sans rendu complet en test (même choix que pour
  // le bouton « Envoyer », voir tests/billing-invoice-send-button.test.ts) :
  // on vérifie la présence et le câblage exact sur la source.
  const page = readFileSync('app/(app)/billing/BillingManager.tsx', 'utf8');

  it('le type Detail porte désormais settled_invoices', () => {
    expect(page).toMatch(/settled_invoices: SettledInvoiceRow\[\];/);
  });

  it('le bloc est affiché sous les factures en attente, jamais masqué', () => {
    const pendingIdx = page.indexOf('Factures en attente de règlement');
    const settledIdx = page.indexOf('Factures soldées');
    expect(pendingIdx).toBeGreaterThan(-1);
    expect(settledIdx).toBeGreaterThan(pendingIdx);
  });

  it('chaque ligne soldée propose un lien PDF pour réimpression', () => {
    expect(page).toMatch(/detail\.settled_invoices\.map\(\(i\) => \(/);
    expect(page).toMatch(/href=\{`\/api\/invoices\/\$\{i\.id\}\/pdf`\} target="_blank"/);
  });
});
