// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { InvoiceService } from '@/lib/services/invoice-service';
import { computeClosurePreview } from '@/lib/services/closure-preview';
import { ClosingService } from '@/lib/services/closing-service';

/**
 * Solder une facture « en compte » (Facturation → « Solder la facture »)
 * marquait la facture payée et créditait le solde client, mais ne traçait
 * NULLE PART l'argent réellement encaissé : ni dans account_settlement_payments
 * (réconciliation de clôture / ligne « Règlements en compte »), ni, en
 * espèces, dans cash_movements (tiroir). Un règlement carte ou espèces sur
 * une facture de période restait donc invisible du montant « attendu » à la
 * clôture — alors que le client avait réellement payé ce jour-là — et le CA
 * du jour, lui, n'en bougeait jamais (la vente avait déjà cumulé le CA à son
 * origine, bien avant). Ce fichier vérifie que le règlement est désormais
 * correctement reflété dans la réconciliation de clôture, SANS jamais
 * affecter le CA.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: settleRoute } = await import('@/app/api/invoices/[id]/settle/route');

describe.skipIf(!hasDb)('Solder une facture : réconciliation de clôture, CA inchangé', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let customerId: string;
  // account_settlement_payments.created_at est toujours `now()` (l'argent est
  // réellement encaissé à cet instant) : DAY doit donc être AUJOURD'HUI pour
  // que les règlements et la clôture portent sur la même journée.
  const DAY = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Settle Invoice ${randomUUID()}`],
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
      [organizationId, `settle-${randomUUID()}@example.test`],
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

  async function makeInvoice(amount: number): Promise<{ id: string }> {
    const inv = await query<{ id: string }>(
      `INSERT INTO invoices
         (organization_id, store_id, customer_id, invoice_type, number, sequence_value, status,
          issue_date, due_date, total_ht, total_tva, total_ttc, tva_breakdown,
          payment_terms, created_at)
       VALUES ($1,$2,$3,'standard',$4,1,'sent',$5::date,$5::date,$6,0,$6,'[]'::jsonb,'À réception', $7::timestamptz)
       RETURNING id`,
      [organizationId, storeId, customerId, `F-TEST-${randomUUID()}`, DAY, amount, `${DAY}T09:00:00Z`],
    );
    return inv.rows[0]!;
  }

  it('solde en CARTE : visible dans la réconciliation de clôture (preview ET sealed), CA inchangé', async () => {
    const inv = await makeInvoice(150);
    const out = await InvoiceService.settleInvoice({
      organizationId, userId, invoiceId: inv.id, amount: 150, method: 'card',
    });
    expect(out.invoice_id).toBe(inv.id);

    const asp = await query<{ method: string; amount: string }>(
      `SELECT method, amount::text FROM account_settlement_payments WHERE customer_id = $1`,
      [customerId],
    );
    expect(asp.rows).toHaveLength(1);
    expect(asp.rows[0]).toMatchObject({ method: 'card', amount: '150.00' });

    const preview = await computeClosurePreview(storeId, DAY);
    const cardLine = preview.payments.find((p) => p.method === 'card');
    expect(cardLine?.total).toBe(150);
    // Le CA du jour reste à zéro : aucune vente n'a été créée.
    expect(preview.totals.ttc).toBe(0);
    expect(preview.totals.sales).toBe(0);

    const sealed = await ClosingService.sealDaily({
      organizationId, storeId, userId, businessDate: DAY,
    });
    expect(sealed.totals.total_ttc).toBe(0);
  });

  it('solde en ESPÈCES sans caisse ouverte : refusé (NO_OPEN_SESSION), rien n\'est écrit', async () => {
    const inv = await makeInvoice(80);
    await expect(
      InvoiceService.settleInvoice({ organizationId, userId, invoiceId: inv.id, amount: 80, method: 'cash' }),
    ).rejects.toThrow('NO_OPEN_SESSION');

    const stillSent = await query<{ status: string }>(`SELECT status FROM invoices WHERE id = $1`, [inv.id]);
    expect(stillSent.rows[0]!.status).toBe('sent');
    const asp = await query(`SELECT 1 FROM account_settlement_payments WHERE customer_id = $1 AND method = 'cash'`, [customerId]);
    expect(asp.rowCount).toBe(0);
  });

  it('solde en ESPÈCES avec caisse ouverte : entrée de caisse tracée, comptée dans l\'espèces attendue de la clôture', async () => {
    const session = await query<{ id: string }>(
      `INSERT INTO cash_sessions (organization_id, store_id, register_id, opened_by, opening_float, status, opened_at)
       VALUES ($1,$2,$3,$4,0,'open',$5::timestamptz) RETURNING id`,
      [organizationId, storeId, registerId, userId, `${DAY}T08:00:00Z`],
    );
    const sessionId = session.rows[0]!.id;

    const inv = await makeInvoice(40);
    await InvoiceService.settleInvoice({ organizationId, userId, invoiceId: inv.id, amount: 40, method: 'cash' });

    const movement = await query<{ movement_type: string; amount: string }>(
      `SELECT movement_type, amount::text FROM cash_movements WHERE cash_session_id = $1`,
      [sessionId],
    );
    expect(movement.rows).toHaveLength(1);
    expect(movement.rows[0]).toMatchObject({ movement_type: 'in', amount: '40.0000' });

    const preview = await computeClosurePreview(storeId, DAY);
    expect(preview.cash_breakdown.expected).toBeGreaterThanOrEqual(40);
    // Les espèces réglées en compte ne doivent PAS apparaître une seconde
    // fois dans la liste "payments" (déjà comptées via cash_movements) : la
    // désunion exclut explicitement method='cash'.
    const cashLine = preview.payments.find((p) => p.method === 'cash');
    expect(cashLine).toBeUndefined();
  });

  it('la route /settle exige un mode de règlement (schéma désormais obligatoire)', async () => {
    const inv = await makeInvoice(20);
    const res = await settleRoute(
      new Request('https://x.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 20 }) }),
      { params: { id: inv.id } },
    );
    expect(res.status).toBe(400);
  });
});
