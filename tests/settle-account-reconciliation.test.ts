// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { InvoiceService } from '@/lib/services/invoice-service';
import { computeClosurePreview } from '@/lib/services/closure-preview';

/**
 * Bug remonté en production : un règlement de solde client négatif fait
 * depuis la FICHE CLIENT (Clients → « Solder le compte », SettleAccountModal
 * dans CustomersList.tsx) en carte/chèque/virement restait invisible de la
 * réconciliation de clôture — l'argent était réellement encaissé mais
 * jamais compté dans le « Système » attendu, créant un écart « en trop » au
 * soir (ex. 74 € en CB de plus qu'attendu).
 *
 * Root cause (double) :
 *  1. InvoiceService.settleAccount (appelée par cette route, DISTINCTE de
 *     settleAccountWithPayments utilisée par la caisse) n'écrivait JAMAIS
 *     dans account_settlement_payments, contrairement aux deux autres
 *     chemins de règlement (settleInvoice, settleAccountWithPayments) — seule
 *     l'entrée cash_movements (espèces) existait, sans équivalent pour les
 *     autres modes.
 *  2. Le store_id envoyé par le client (CustomersList.tsx) vient de
 *     localStorage['webpos_current_store_id'], une clé qui n'est ÉCRITE nulle
 *     part dans le code (seulement lue) — toujours null en pratique. Sans
 *     boutique, même une ligne correctement écrite reste invisible : la
 *     réconciliation filtre `WHERE store_id = $1`.
 *
 * Intégration contre une VRAIE base Postgres.
 */
describe('/api/customers/[id]/settle-account — repli serveur sur resolveDeviceStoreId', () => {
  const route = readFileSync('app/api/customers/[id]/settle-account/route.ts', 'utf8');

  it('résout la boutique via resolveDeviceStoreId quand le client n\'en envoie pas', () => {
    expect(route).toMatch(/import \{ resolveDeviceStoreId \} from '@\/lib\/pos\/current-store';/);
    expect(route).toMatch(/const storeId = parsed\.data\.store_id \?\? \(await resolveDeviceStoreId\(g\.user\.organizationId\)\) \?\? undefined;/);
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('InvoiceService.settleAccount — visible de la réconciliation de clôture', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let customerId: string;
  const DAY = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Settle Account ${randomUUID()}`],
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
      [organizationId, `sa-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name, account_balance)
       VALUES ($1,'Solde','Négatif', -74) RETURNING id`,
      [organizationId],
    );
    customerId = customer.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  it('un règlement CARTE crédite le solde ET apparaît dans la réconciliation de clôture (count + total)', async () => {
    const out = await InvoiceService.settleAccount({
      organizationId, userId, customerId, amount: 74, method: 'card', storeId,
    });
    expect(out.new_balance).toBe(0);

    const asp = await query<{ method: string; amount: string; store_id: string | null }>(
      `SELECT method, amount::text, store_id FROM account_settlement_payments WHERE customer_id = $1`,
      [customerId],
    );
    expect(asp.rows).toMatchObject([{ method: 'card', amount: '74.00', store_id: storeId }]);

    const preview = await computeClosurePreview(storeId, DAY);
    const card = preview.payments.find((p) => p.method === 'card');
    expect(card).toMatchObject({ total: 74, count: 1 });
  });

  it('sans storeId résolu (poste jamais appairé), le règlement reste invisible — d\'où le repli serveur ci-dessus', async () => {
    const customer2 = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name, account_balance)
       VALUES ($1,'Autre','Client', -20) RETURNING id`,
      [organizationId],
    );
    const customerId2 = customer2.rows[0]!.id;

    await InvoiceService.settleAccount({
      organizationId, userId, customerId: customerId2, amount: 20, method: 'card', storeId: null,
    });

    const asp = await query<{ store_id: string | null }>(
      `SELECT store_id FROM account_settlement_payments WHERE customer_id = $1`,
      [customerId2],
    );
    expect(asp.rows[0]!.store_id).toBeNull();

    // La réconciliation de LA boutique ne voit donc rien de ce règlement —
    // c'est précisément le bug : d'où l'intérêt de toujours résoudre une
    // boutique côté serveur (resolveDeviceStoreId) plutôt que de dépendre du
    // store_id envoyé par le client.
    const preview = await computeClosurePreview(storeId, DAY);
    const card = preview.payments.find((p) => p.method === 'card');
    expect(card?.total).toBe(74); // seul le règlement du test précédent, pas celui-ci
  });

  it('un règlement par CHÈQUE ou VIREMENT est aussi tracé (pas seulement carte/espèces)', async () => {
    const customer3 = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name, account_balance)
       VALUES ($1,'Chèque','Client', -15) RETURNING id`,
      [organizationId],
    );
    const customerId3 = customer3.rows[0]!.id;

    await InvoiceService.settleAccount({
      organizationId, userId, customerId: customerId3, amount: 15, method: 'check', storeId,
    });

    const preview = await computeClosurePreview(storeId, DAY);
    const check = preview.payments.find((p) => p.method === 'check');
    expect(check).toMatchObject({ total: 15, count: 1 });
  });

  it('un règlement en ESPÈCES continue de passer par cash_movements (comportement inchangé)', async () => {
    const customer4 = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name, account_balance)
       VALUES ($1,'Espèces','Client', -8) RETURNING id`,
      [organizationId],
    );
    const customerId4 = customer4.rows[0]!.id;
    const session = await query<{ id: string }>(
      `INSERT INTO cash_sessions (organization_id, store_id, register_id, status, opened_at, opened_by, opening_float)
       VALUES ($1,$2,$3,'open', now(), $4, 200) RETURNING id`,
      [organizationId, storeId, registerId, userId],
    );

    await InvoiceService.settleAccount({
      organizationId, userId, customerId: customerId4, amount: 8, method: 'cash', storeId,
    });

    const movement = await query<{ amount: string }>(
      `SELECT amount::text FROM cash_movements WHERE cash_session_id = $1`,
      [session.rows[0]!.id],
    );
    expect(movement.rows).toMatchObject([{ amount: '8.0000' }]);
  });
});
