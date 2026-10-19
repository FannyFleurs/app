// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { ensureVirtualRegisterSession } from '@/lib/services/virtual-register';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { ClosingService } from '@/lib/services/closing-service';
import { SaleService } from '@/lib/services/sale-service';

/**
 * Caisse virtuelle (commandes WEB/OGF auto-encaissées) : sa session reste en
 * permanence ouverte, mais ne doit JAMAIS être confondue avec la session
 * réelle d'une boutique en fonds commun (shared_float=true, réglage par
 * défaut de TOUTE boutique) — sinon un poste réel "rejoindrait" sa session
 * au lieu d'ouvrir le vrai fonds, et une vente comptant s'y encaisserait par
 * erreur. Et elle ne doit jamais être fermée par la clôture du soir.
 *
 * Intégration contre une vraie base Postgres.
 */
describe('Caisse virtuelle — isolation du fonds commun et de la clôture', () => {
  let organizationId: string;
  let storeId: string;
  let realRegisterId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Virtual Register ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'VR', 'Virtual Register') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse réelle') RETURNING id`,
      [organizationId, storeId],
    );
    realRegisterId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `vr-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('crée la caisse virtuelle et sa session ouverte, de façon idempotente', async () => {
    const first = await ensureVirtualRegisterSession(organizationId, storeId, userId);
    const second = await ensureVirtualRegisterSession(organizationId, storeId, userId);
    expect(second.registerId).toBe(first.registerId);
    expect(second.sessionId).toBe(first.sessionId);

    const reg = await query<{ is_virtual: boolean; code: string }>(
      `SELECT is_virtual, code FROM registers WHERE id = $1`, [first.registerId],
    );
    expect(reg.rows[0]).toMatchObject({ is_virtual: true, code: 'WEB' });

    const sess = await query<{ status: string }>(
      `SELECT status FROM cash_sessions WHERE id = $1`, [first.sessionId],
    );
    expect(sess.rows[0]!.status).toBe('open');
  });

  it("le fonds commun (shared_float, réglage par défaut) ne résout JAMAIS la session de la caisse virtuelle", async () => {
    const { sessionId: virtualSessionId } = await ensureVirtualRegisterSession(organizationId, storeId, userId);

    // La caisse virtuelle est "la plus ancienne session ouverte" de la
    // boutique (créée au tout premier test) — exactement le piège visé.
    const resolved = await CashSessionService.resolveOpenSessionId({
      storeId, registerId: realRegisterId, shared: true,
    });
    expect(resolved).not.toBe(virtualSessionId);
    expect(resolved).toBeNull(); // aucune VRAIE session encore ouverte à ce stade

    const openForStore = await CashSessionService.getOpenForStore(storeId);
    expect(openForStore).toBeNull();
  });

  it("un poste réel en fonds commun OUVRE son propre fonds plutôt que de rejoindre la caisse virtuelle", async () => {
    await ensureVirtualRegisterSession(organizationId, storeId, userId);
    const opened = await CashSessionService.open({
      organizationId, storeId, registerId: realRegisterId, userId, openingFloat: 150, shared: true,
    });
    expect(opened.joined ?? false).toBe(false);

    const sess = await query<{ register_id: string; opening_float: string }>(
      `SELECT register_id, opening_float FROM cash_sessions WHERE id = $1`, [opened.id],
    );
    expect(sess.rows[0]!.register_id).toBe(realRegisterId);
    expect(Number(sess.rows[0]!.opening_float)).toBe(150);

    const resolved = await CashSessionService.resolveOpenSessionId({
      storeId, registerId: realRegisterId, shared: true,
    });
    expect(resolved).toBe(opened.id);
  });

  it("la clôture du soir ferme la session réelle mais JAMAIS celle de la caisse virtuelle", async () => {
    const { sessionId: virtualSessionId } = await ensureVirtualRegisterSession(organizationId, storeId, userId);
    const businessDate = new Date().toISOString().slice(0, 10);

    await ClosingService.sealDaily({ organizationId, storeId, userId, businessDate, countedCash: 150 });

    const virtualSess = await query<{ status: string }>(
      `SELECT status FROM cash_sessions WHERE id = $1`, [virtualSessionId],
    );
    expect(virtualSess.rows[0]!.status).toBe('open');

    const realSess = await query<{ status: string }>(
      `SELECT status FROM cash_sessions WHERE register_id = $1 ORDER BY opened_at DESC LIMIT 1`, [realRegisterId],
    );
    expect(realSess.rows[0]!.status).toBe('closed');
  });

  it('une vente VALIDÉE directement sur la session de la caisse virtuelle fonctionne (SaleService.validate)', async () => {
    const { registerId: vRegId, sessionId: vSessId } = await ensureVirtualRegisterSession(organizationId, storeId, userId);
    const taxRate = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate) VALUES ($1, 'STD', '20%', 20)
       ON CONFLICT DO NOTHING RETURNING id`,
      [organizationId],
    );
    const rateId = taxRate.rows[0]?.id ?? (
      await query<{ id: string }>(`SELECT id FROM tax_rates WHERE organization_id = $1 LIMIT 1`, [organizationId])
    ).rows[0]!.id;
    const product = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, unit, tax_rate_id, sale_price_ttc)
       VALUES ($1, 'Bouquet virtuel', 'unité', $2, 30) RETURNING id`,
      [organizationId, rateId],
    );

    // Pas via SaleService.createDraft : en fonds commun (réglage par défaut),
    // il résout la session par BOUTIQUE (qui exclut la caisse virtuelle, test
    // précédent) et échouerait (NO_OPEN_CASH_SESSION) — exactement voulu pour
    // un poste réel. Seul order-intake.ts crée une vente DIRECTEMENT sur la
    // session de la caisse virtuelle (cash_session_id posé explicitement).
    const draft = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, cash_session_id, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'on_hold') RETURNING id`,
      [organizationId, storeId, vRegId, vSessId, userId],
    );
    await SaleService.setLines(draft.rows[0]!.id, organizationId, [{
      product_id: product.rows[0]!.id, label: 'Bouquet virtuel', unit_price_ttc: 30, quantity: 1,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    const sale = await SaleService.validate({
      saleId: draft.rows[0]!.id, organizationId, userId, payments: [{ method: 'card', amount: 30 }],
    });
    expect(sale.receiptNumber).toBeTruthy();

    const row = await query<{ cash_session_id: string; status: string }>(
      `SELECT cash_session_id, status FROM sales WHERE id = $1`, [draft.rows[0]!.id],
    );
    expect(row.rows[0]).toMatchObject({ cash_session_id: vSessId, status: 'validated' });
  });
});
