// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Bug remonté en production : l'ouverture du tiroir-caisse par mode de
 * règlement (case « Tiroir ») était une colonne UNIQUE par organisation
 * (payment_methods.opens_drawer) — la modifier depuis une boutique la
 * modifiait donc pour TOUTES les boutiques de l'organisation. Chaque
 * boutique doit pouvoir définir SON propre réglage, sans affecter les
 * autres.
 *
 * Intégration contre une VRAIE base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: getDrawer, PATCH: patchDrawer } = await import('@/app/api/settings/payment-method-drawer/route');
const { GET: listMethods } = await import('@/app/api/payment-methods/route');
const { PATCH: patchMethod } = await import('@/app/api/payment-methods/[id]/route');

describe('Ouverture du tiroir par mode de règlement — paramétrage par boutique', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let cashMethodId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Drawer Settings ${randomUUID()}`],
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
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `pmd-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Valeur historique : espèces ouvre le tiroir, chèque non (même défaut
    // que la migration 0060 : opens_drawer=TRUE pour kind='cash').
    const cash = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, opens_drawer)
       VALUES ($1, 'cash_test', 'cash', 'Espèces', TRUE) RETURNING id`,
      [organizationId],
    );
    cashMethodId = cash.rows[0]!.id;
    await query(
      `INSERT INTO payment_methods (organization_id, code, kind, label, opens_drawer)
       VALUES ($1, 'check_test', 'check', 'Chèque', FALSE)`,
      [organizationId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  function getReq(storeId: string) {
    return getDrawer(new Request(`https://x.test/api/settings/payment-method-drawer?store_id=${storeId}`));
  }
  function patchReq(body: Record<string, unknown>) {
    return patchDrawer(new Request('https://x.test/api/settings/payment-method-drawer', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  }

  it('sans override, chaque boutique voit la valeur historique de la colonne opens_drawer', async () => {
    const resA = await getReq(storeAId);
    const { settings } = await resA.json();
    expect(settings.cash_test).toBe(true);
    expect(settings.check_test).toBe(false);
  });

  it("modifier le réglage d'une boutique ne modifie PAS celui d'une autre boutique (régression du bug)", async () => {
    const res = await patchReq({ store_id: storeAId, code: 'cash_test', opens_drawer: false });
    expect(res.status).toBe(200);

    const afterA = await (await getReq(storeAId)).json();
    expect(afterA.settings.cash_test).toBe(false);

    const afterB = await (await getReq(storeBId)).json();
    expect(afterB.settings.cash_test).toBe(true);

    // La colonne historique elle-même n'a pas bougé : seul un override
    // propre à la boutique A a été écrit.
    const col = await query<{ opens_drawer: boolean }>(
      `SELECT opens_drawer FROM payment_methods WHERE id = $1`,
      [cashMethodId],
    );
    expect(col.rows[0]?.opens_drawer).toBe(true);
  });

  it('GET /api/payment-methods?store_id=... reflète le réglage par boutique (cash_test désactivé pour A, actif pour B)', async () => {
    const resA = await listMethods(new Request(`https://x.test/api/payment-methods?store_id=${storeAId}`));
    const methodsA = (await resA.json()).methods as Array<{ code: string; opens_drawer: boolean }>;
    expect(methodsA.find((m) => m.code === 'cash_test')?.opens_drawer).toBe(false);

    const resB = await listMethods(new Request(`https://x.test/api/payment-methods?store_id=${storeBId}`));
    const methodsB = (await resB.json()).methods as Array<{ code: string; opens_drawer: boolean }>;
    expect(methodsB.find((m) => m.code === 'cash_test')?.opens_drawer).toBe(true);
  });

  it("PATCH /api/payment-methods/[id] n'accepte plus opens_drawer (seul le réglage par boutique le modifie désormais)", async () => {
    const res = await patchMethod(
      new Request('https://x.test', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opens_drawer: true }),
      }),
      { params: { id: cashMethodId } },
    );
    expect(res.status).toBe(200);
    // Toujours TRUE : le champ est ignoré (schéma), la colonne historique
    // n'est jamais touchée par cette route.
    const col = await query<{ opens_drawer: boolean }>(
      `SELECT opens_drawer FROM payment_methods WHERE id = $1`,
      [cashMethodId],
    );
    expect(col.rows[0]?.opens_drawer).toBe(true);
    // Et le réglage de la boutique A, lui, reste à false (non affecté).
    const afterA = await (await getReq(storeAId)).json();
    expect(afterA.settings.cash_test).toBe(false);
  });

  it('rejette une boutique hors organisation (404)', async () => {
    const res = await patchReq({ store_id: randomUUID(), code: 'cash_test', opens_drawer: true });
    expect(res.status).toBe(404);
  });

  it('store_id est obligatoire en écriture (422)', async () => {
    const res = await patchDrawer(new Request('https://x.test/api/settings/payment-method-drawer', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'cash_test', opens_drawer: true }),
    }));
    expect(res.status).toBe(422);
  });
});
