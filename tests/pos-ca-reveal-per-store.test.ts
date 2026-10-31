// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { loadCaRevealOverride, saveCaRevealOverride } from '@/lib/settings/ca-reveal-server';

/**
 * CA du jour sur la TopBar de la caisse (icône œil, à gauche du bouton
 * assistance) : réglage PAR BOUTIQUE (clé `pos_ca_reveal:<storeId>`), même
 * principe que l'affichage du stock (show-stock-server.ts), avec repli sur
 * un défaut organisation si aucune boutique n'a de réglage propre.
 *
 * Désactivé par défaut : le CA est une donnée sensible, elle ne s'affiche
 * que si une boutique l'active explicitement.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: caRevealGet, PATCH: caRevealPatch } = await import('@/app/api/settings/pos/ca-reveal/route');

describe.skipIf(!hasDb)('CA du jour sur la caisse — réglage par boutique', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Reveal ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `car-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sans aucun réglage, la valeur effective est null (l\'appelant applique false par défaut)', async () => {
    expect(await loadCaRevealOverride(organizationId, storeAId)).toBeNull();
  });

  it('active le réglage sur UNE boutique : l\'autre boutique n\'est PAS affectée', async () => {
    await saveCaRevealOverride(organizationId, storeAId, true, userId);
    expect(await loadCaRevealOverride(organizationId, storeAId)).toBe(true);
    expect(await loadCaRevealOverride(organizationId, storeBId)).toBeNull();
  });

  it('désactiver (false) une boutique est bien pris en compte, pas confondu avec "aucun réglage"', async () => {
    await saveCaRevealOverride(organizationId, storeBId, false, userId);
    expect(await loadCaRevealOverride(organizationId, storeBId)).toBe(false);
    expect(await loadCaRevealOverride(organizationId, storeAId)).toBe(true);
  });

  it('un réglage "toutes les boutiques" (sans storeId) sert de défaut à une boutique sans réglage propre', async () => {
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Reveal Default ${randomUUID()}`],
    );
    const org2Id = org2.rows[0]!.id;
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org2Id],
    );
    await saveCaRevealOverride(org2Id, null, true, userId);
    expect(await loadCaRevealOverride(org2Id, store2.rows[0]!.id)).toBe(true);
  });

  async function get(storeId: string | null): Promise<boolean> {
    const url = storeId
      ? `https://x.test/api/settings/pos/ca-reveal?store_id=${storeId}`
      : 'https://x.test/api/settings/pos/ca-reveal';
    const res = await caRevealGet(new Request(url));
    const body = await res.json() as { enabled: boolean };
    return body.enabled;
  }
  async function patch(storeId: string | null, enabled: boolean) {
    return caRevealPatch(new Request('https://x.test/api/settings/pos/ca-reveal', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, enabled }),
    }));
  }

  it('API : PATCH sur une boutique ne modifie QUE cette boutique (bout en bout)', async () => {
    const org4 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Reveal API ${randomUUID()}`],
    );
    const org4Id = org4.rows[0]!.id;
    const s1 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org4Id],
    );
    const s2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [org4Id],
    );
    const user4 = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [org4Id, `car4-${randomUUID()}@example.test`],
    );
    currentUser = { id: user4.rows[0]!.id, organizationId: org4Id, email: 'x', fullName: 'Testeur', role: 'owner' };

    // État initial : désactivé par défaut pour les deux boutiques.
    expect(await get(s1.rows[0]!.id)).toBe(false);
    expect(await get(s2.rows[0]!.id)).toBe(false);

    const res = await patch(s1.rows[0]!.id, true);
    expect(res.status).toBe(200);

    expect(await get(s1.rows[0]!.id)).toBe(true);
    expect(await get(s2.rows[0]!.id)).toBe(false); // toujours inchangée
  });

  it('API : refuse une boutique d\'une AUTRE organisation', async () => {
    const otherOrg = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Reveal Other Org ${randomUUID()}`],
    );
    const otherStore = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'XX', 'Autre') RETURNING id`,
      [otherOrg.rows[0]!.id],
    );
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const res = await patch(otherStore.rows[0]!.id, true);
    expect(res.status).toBe(404);
  });
});
