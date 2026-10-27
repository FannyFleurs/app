// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { sha256Hex } from '@/lib/settings/order-integration-server';
import { createIncomingOrder } from '@/lib/services/order-intake';
import { computeDayHistory } from '@/lib/services/day-history';

/**
 * Incident production : une commande WEB reçue n'est apparue NULLE PART (ni
 * « En attente », ni CA) — et, en l'absence de toute trace, impossible à
 * diagnostiquer après coup. L'app commande ne vérifie pas la réponse HTTP et
 * confirme TOUJOURS au client, quel que soit le résultat côté HelloPos.
 *
 * Corrigé en journalisant systématiquement (audit_logs, action
 * `order_intake.rejected` / `order_intake.auto_checkout_failed`) chaque
 * échec de réception ou d'encaissement automatique — lu par
 * /api/order-intake-failures et la page /commandes-rejetees, et repris dans
 * le journal du jour (Historiques) quand une boutique a pu être résolue.
 *
 * Intégration contre une VRAIE base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: incomingPost } = await import('@/app/api/orders/incoming/route');
const { GET: failuresGet } = await import('@/app/api/order-intake-failures/route');

describe('order-intake — journal des échecs (/commandes-rejetees)', () => {
  let organizationId: string;
  let storeId: string;
  let token: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Order Intake Failures ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T1', 'Boutique Test') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    await query(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner')`,
      [organizationId, `oif-${randomUUID()}@example.test`],
    );
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );
    currentUser = {
      id: (await query<{ id: string }>(`SELECT id FROM users WHERE organization_id = $1`, [organizationId])).rows[0]!.id,
      organizationId, email: 'x', fullName: 'Testeur', role: 'owner',
    };

    token = `hpo_test_${randomUUID()}`;
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'order_integration', $2::jsonb)`,
      [organizationId, JSON.stringify({
        enabled: true,
        token_hash: sha256Hex(token),
        token_hint: token.slice(-6),
        boutique_map: { 'Boutique Test': storeId },
        callback_url: null,
        callback_secret: null,
      })],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return incomingPost(new Request('https://x.test/api/orders/incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }));
  }

  async function lastFailure(action: string) {
    const r = await query<{ action: string; payload: Record<string, unknown>; organization_id: string | null }>(
      `SELECT action, payload, organization_id FROM audit_logs
        WHERE action = $1 ORDER BY created_at DESC LIMIT 1`,
      [action],
    );
    return r.rows[0] ?? null;
  }

  it('jeton absent : rejeté, journalisé SANS organisation (non attribuable)', async () => {
    const res = await post({ external_ref: 'x', boutique: 'Boutique Test', lines: [{ label: 'A', amount_ttc: 10 }] });
    expect(res.status).toBe(401);
    const row = await lastFailure('order_intake.rejected');
    expect(row).toBeTruthy();
    expect(row!.organization_id).toBeNull();
    expect(row!.payload.reason).toBe('MISSING_TOKEN');
  });

  it('jeton invalide : rejeté, journalisé SANS organisation', async () => {
    const res = await post(
      { external_ref: 'x', boutique: 'Boutique Test', lines: [{ label: 'A', amount_ttc: 10 }] },
      { Authorization: 'Bearer hpo_totally_wrong' },
    );
    expect(res.status).toBe(401);
    const row = await lastFailure('order_intake.rejected');
    expect(row!.organization_id).toBeNull();
    expect(row!.payload.reason).toBe('INVALID_TOKEN');
  });

  it('boutique non mappée : rejetée, journalisée AVEC l\'organisation et le libellé tenté', async () => {
    const extRef = `web-${randomUUID()}`;
    const res = await post(
      { external_ref: extRef, boutique: 'Boutique Inconnue', lines: [{ label: 'Bouquet', amount_ttc: 25 }] },
      { Authorization: `Bearer ${token}` },
    );
    expect(res.status).toBe(422);
    const row = await lastFailure('order_intake.rejected');
    expect(row!.organization_id).toBe(organizationId);
    expect(row!.payload).toMatchObject({ reason: 'UNKNOWN_BOUTIQUE', boutique: 'Boutique Inconnue', external_ref: extRef });

    // Aucune vente n'a été créée pour autant (le rejet ne doit rien laisser de fantôme).
    const sale = await query(`SELECT 1 FROM sales WHERE client_ref = $1`, [extRef]);
    expect(sale.rowCount).toBe(0);
  });

  it('aucune caisse active (store sans registre) : rejetée après tentative, journalisée avec store_id', async () => {
    const extRef = `web-${randomUUID()}`;
    // Aucun register créé pour cette boutique, et pas d'encaissement auto configuré.
    const res = await post(
      { external_ref: extRef, boutique: 'Boutique Test', source: 'WEB', lines: [{ label: 'Bouquet', amount_ttc: 25 }] },
      { Authorization: `Bearer ${token}` },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('NO_ACTIVE_REGISTER');
    const row = await lastFailure('order_intake.rejected');
    expect(row!.organization_id).toBe(organizationId);
    expect(row!.payload).toMatchObject({ reason: 'NO_ACTIVE_REGISTER', store_id: storeId, external_ref: extRef });
  });

  it('/api/order-intake-failures : renvoie les échecs de CETTE organisation, les plus récents en premier', async () => {
    const res = await failuresGet();
    expect(res.status).toBe(200);
    const { failures } = await res.json() as { failures: { action: string; payload: Record<string, unknown> }[] };
    expect(failures.length).toBeGreaterThanOrEqual(2); // UNKNOWN_BOUTIQUE + NO_ACTIVE_REGISTER ci-dessus
    expect(failures.every((f) => f.action === 'order_intake.rejected' || f.action === 'order_intake.auto_checkout_failed')).toBe(true);
    // Ne contient jamais les rejets "jeton" (organization_id NULL, autre organisation).
    const reasons = failures.map((f) => f.payload.reason);
    expect(reasons).not.toContain('MISSING_TOKEN');
    expect(reasons).not.toContain('INVALID_TOKEN');
  });

  it('encaissement automatique en échec (ex. mode "différé" sans client) : la vente EXISTE (on_hold), journalisée en plus', async () => {
    const deferred = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, is_active)
       VALUES ($1, 'deferred', 'deferred', 'Différé client', TRUE) RETURNING id`,
      [organizationId],
    );
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'order_auto_checkout', $2::jsonb)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [organizationId, JSON.stringify({ enabled: true, web_payment_method_id: deferred.rows[0]!.id, ogf_payment_method_id: null })],
    );

    const extRef = `web-${randomUUID()}`;
    const out = await createIncomingOrder({
      organizationId, storeId, externalRef: extRef, boutiqueLabel: 'Boutique Test',
      source: 'WEB', lines: [{ label: 'Bouquet', amount_ttc: 40 }],
    });
    // La vente reste en attente (repli), elle n'est PAS perdue.
    expect(out.status).toBe('on_hold');
    const sale = await query<{ status: string }>(`SELECT status FROM sales WHERE id = $1`, [out.id]);
    expect(sale.rows[0]!.status).toBe('on_hold');

    const row = await lastFailure('order_intake.auto_checkout_failed');
    expect(row!.organization_id).toBe(organizationId);
    expect(row!.payload).toMatchObject({
      reason: 'DEFERRED_REQUIRES_CUSTOMER', store_id: storeId, external_ref: extRef,
    });

    // Reprise dans le journal du jour (Historiques), boutique par boutique.
    const today = new Date().toISOString().slice(0, 10);
    const history = await computeDayHistory({ organizationId, storeId, date: today });
    const evt = history.events.find((e) => e.label === 'Commande reçue, encaissement auto échoué');
    expect(evt).toBeTruthy();
    expect(evt!.attention).toBe(true);

    // Désactive le réglage pour ne pas affecter un éventuel test suivant réutilisant cette org.
    await query(
      `UPDATE settings SET value = jsonb_set(value, '{enabled}', 'false') WHERE organization_id = $1 AND key = 'order_auto_checkout'`,
      [organizationId],
    );
  });
});
