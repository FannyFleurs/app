// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { query, pool } from '@/lib/db/client';
import { parseCustomerWorkbook } from '@/lib/customers/import-core';
import { CUSTOMER_IMPORT_COLUMNS } from '@/lib/customers/import-columns';

/**
 * Import clients — colonne « Solde dû (en compte) € » (reprise d'un ancien
 * système : comptes clients en négatif, solde à régler). Le fichier exprime
 * TOUJOURS un montant dû POSITIF (ex. 250 = le client doit 250 €) ; stocké en
 * base comme account_balance NÉGATIF (même convention que
 * sale-service.ts/invoice-service.ts : account_balance < 0 = dette), pour
 * pouvoir être réglé normalement ensuite (caisse, page Facturation — voir
 * /api/billing/customers, qui liste les account_balance < 0).
 *
 * Contrairement aux points de fidélité (cumulés à chaque import), le solde dû
 * est REMPLACÉ par la valeur du fichier : c'est une reprise d'état, pas un
 * delta, donc ré-importer le même fichier doit rester idempotent.
 */
async function makeXlsx(rows: Record<string, string | number>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clients');
  ws.columns = CUSTOMER_IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key }));
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseCustomerWorkbook — colonne Solde dû', () => {
  it('un montant positif est repris tel quel (en attente de conversion négative à l\'écriture)', async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Jean', last_name: 'Martin', balance_due: 250 }]);
    const { rows } = await parseCustomerWorkbook(buf, 0.05);
    expect(rows[0]).toMatchObject({ hasBalanceDue: true, balanceDue: 250 });
  });

  it('un montant négatif collé par erreur (ancien export) est ramené en valeur absolue', async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Jean', last_name: 'Martin', balance_due: -250 }]);
    const { rows } = await parseCustomerWorkbook(buf, 0.05);
    expect(rows[0]).toMatchObject({ hasBalanceDue: true, balanceDue: 250 });
  });

  it('une cellule vide ne touche pas au solde (hasBalanceDue: false)', async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Jean', last_name: 'Martin', balance_due: '' }]);
    const { rows } = await parseCustomerWorkbook(buf, 0.05);
    expect(rows[0]).toMatchObject({ hasBalanceDue: false, balanceDue: 0 });
  });

  it('« 0 » explicite est distinct du vide (hasBalanceDue: true, balanceDue: 0)', async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Jean', last_name: 'Martin', balance_due: 0 }]);
    const { rows } = await parseCustomerWorkbook(buf, 0.05);
    expect(rows[0]).toMatchObject({ hasBalanceDue: true, balanceDue: 0 });
  });

  it('un solde dû non numérique est une erreur de ligne', async () => {
    const buf = await makeXlsx([{ type: 'particulier', first_name: 'Jean', last_name: 'Martin', balance_due: 'abc' }]);
    const { rows } = await parseCustomerWorkbook(buf, 0.05);
    expect(rows[0]!.error).toMatch(/Solde dû invalide/);
  });
});

const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));

const { POST: importCustomers } = await import('@/app/api/customers/import/route');

describe.skipIf(!hasDb)('POST /api/customers/import — écriture du solde dû', () => {
  let organizationId: string;
  let storeId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Customer Import Balance ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `cib-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  async function doImport(rows: Record<string, string | number>[]) {
    const buf = await makeXlsx(rows);
    const form = new FormData();
    form.append('file', new Blob([buf]), 'clients.xlsx');
    form.append('store_ids', JSON.stringify([storeId]));
    const req = new Request('https://x.test/api/customers/import', { method: 'POST', body: form });
    const res = await importCustomers(req);
    return res.json();
  }

  it('un nouveau client avec un solde dû de 250€ est créé avec account_balance = -250', async () => {
    const email = `nouveau-${randomUUID()}@example.test`;
    const result = await doImport([
      { type: 'particulier', first_name: 'Jean', last_name: 'Martin', email, balance_due: 250 },
    ]);
    expect(result.created).toBe(1);
    expect(result.balance_updated).toBe(1);
    const c = await query<{ account_balance: string }>(
      `SELECT account_balance::text FROM customers WHERE organization_id = $1 AND email = $2`,
      [organizationId, email],
    );
    expect(Number(c.rows[0]!.account_balance)).toBe(-250);
  });

  it('un client existant fusionné : le solde dû se CUMULE avec le solde existant (jamais remplacé)', async () => {
    const email = `fusion-${randomUUID()}@example.test`;
    await doImport([{ type: 'particulier', first_name: 'Alice', last_name: 'Durand', email, balance_due: 100 }]);
    // Ré-importe le même fichier : le solde s'ADDITIONNE (-100 puis -200), comme
    // les points de fidélité — pour ne jamais écraser un encours RÉEL déjà
    // accumulé en caisse (ventes "Différé client" sur plusieurs boutiques).
    const result = await doImport([{ type: 'particulier', first_name: 'Alice', last_name: 'Durand', email, balance_due: 100 }]);
    expect(result.updated).toBe(1);
    expect(result.balance_updated).toBe(1);
    const c = await query<{ account_balance: string }>(
      `SELECT account_balance::text FROM customers WHERE organization_id = $1 AND email = $2`,
      [organizationId, email],
    );
    expect(Number(c.rows[0]!.account_balance)).toBe(-200);
  });

  it('un encours réel déjà accumulé en caisse (vente "Différé client") n\'est jamais écrasé par un import ultérieur', async () => {
    const email = `encours-reel-${randomUUID()}@example.test`;
    // Encours réel pré-existant (ex. vente "Différé client" validée en caisse).
    const created = await doImport([{ type: 'particulier', first_name: 'Sophie', last_name: 'Caisse', email }]);
    expect(created.created).toBe(1);
    await query(
      `UPDATE customers SET account_balance = -303.20 WHERE organization_id = $1 AND email = $2`,
      [organizationId, email],
    );
    // Import d'un encours historique supplémentaire (ancien système) : doit
    // s'AJOUTER aux -303,20€ déjà dus, jamais les effacer.
    await doImport([{ type: 'particulier', first_name: 'Sophie', last_name: 'Caisse', email, balance_due: 150 }]);
    const c = await query<{ account_balance: string }>(
      `SELECT account_balance::text FROM customers WHERE organization_id = $1 AND email = $2`,
      [organizationId, email],
    );
    expect(Number(c.rows[0]!.account_balance)).toBe(-453.2);
  });

  it('une fusion SANS colonne solde dû renseignée ne touche pas au solde existant', async () => {
    const email = `sans-colonne-${randomUUID()}@example.test`;
    await doImport([{ type: 'particulier', first_name: 'Paul', last_name: 'Petit', email, balance_due: 75 }]);
    // Ré-importe sans la colonne balance_due du tout (cellule vide).
    await doImport([{ type: 'particulier', first_name: 'Paul', last_name: 'Petit', email, balance_due: '' }]);
    const c = await query<{ account_balance: string }>(
      `SELECT account_balance::text FROM customers WHERE organization_id = $1 AND email = $2`,
      [organizationId, email],
    );
    expect(Number(c.rows[0]!.account_balance)).toBe(-75);
  });

  it('« 0 » explicite n\'a aucun effet (équivalent à une cellule vide, puisque le solde est cumulatif)', async () => {
    const email = `solde-${randomUUID()}@example.test`;
    await doImport([{ type: 'particulier', first_name: 'Eva', last_name: 'Blanc', email, balance_due: 60 }]);
    const result = await doImport([{ type: 'particulier', first_name: 'Eva', last_name: 'Blanc', email, balance_due: 0 }]);
    expect(result.balance_updated).toBe(0);
    const c = await query<{ account_balance: string }>(
      `SELECT account_balance::text FROM customers WHERE organization_id = $1 AND email = $2`,
      [organizationId, email],
    );
    expect(Number(c.rows[0]!.account_balance)).toBe(-60);
  });

  it('le client importé avec solde dû apparaît bien dans /api/billing/customers (account_balance < 0)', async () => {
    const email = `facturation-${randomUUID()}@example.test`;
    await doImport([{ type: 'particulier', first_name: 'Marc', last_name: 'Noir', email, balance_due: 303.2 }]);
    const { GET: billingCustomers } = await import('@/app/api/billing/customers/route');
    const res = await billingCustomers();
    const body = await res.json() as { customers: { name: string; account_balance: number }[] };
    const row = body.customers.find((c) => c.name === 'Marc Noir');
    expect(row?.account_balance).toBe(-303.2);
  });
});
