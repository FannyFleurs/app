// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import {
  loadShowStockOverride, loadAllShowStockOverrides, saveShowStockOverride,
} from '@/lib/settings/show-stock-server';

/**
 * Bug remonté en production : activer/désactiver "Afficher le stock sur la
 * tuile" (Paramètres > Paramètres caisse) s'appliquait à TOUTES les
 * boutiques de l'organisation, alors que l'utilisateur ne voulait modifier
 * QUE la boutique où le changement était fait.
 *
 * Corrigé en rendant ce réglage PAR BOUTIQUE (clé `pos_show_stock:<storeId>`,
 * même principe que tile-size-server.ts), avec repli sur un défaut
 * organisation si aucune boutique n'a de réglage propre — y compris un repli
 * supplémentaire sur l'ancien emplacement unique `pos_ui.show_stock` (pour
 * ne pas réinitialiser les organisations déjà configurées).
 *
 * Attention particulière : `false` est une valeur légitime (pas une absence
 * de réglage) — contrairement à tile_size (toujours une chaîne non vide),
 * un simple test de vérité (`if (value)`) masquerait silencieusement un
 * override "décoché" et retomberait à tort sur le défaut organisation.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: showStockGet, PATCH: showStockPatch } = await import('@/app/api/settings/pos/show-stock/route');

describe.skipIf(!hasDb)('Affichage du stock — réglage par boutique', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Show Stock ${randomUUID()}`],
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
      [organizationId, `ss-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sans aucun réglage, la valeur effective est null (l\'appelant applique son propre défaut)', async () => {
    expect(await loadShowStockOverride(organizationId, storeAId)).toBeNull();
  });

  it('active le réglage sur UNE boutique : l\'autre boutique n\'est PAS affectée', async () => {
    await saveShowStockOverride(organizationId, storeAId, true, userId);
    expect(await loadShowStockOverride(organizationId, storeAId)).toBe(true);
    expect(await loadShowStockOverride(organizationId, storeBId)).toBeNull();
  });

  it('désactiver (false) une boutique est bien pris en compte, pas confondu avec "aucun réglage"', async () => {
    await saveShowStockOverride(organizationId, storeBId, false, userId);
    expect(await loadShowStockOverride(organizationId, storeBId)).toBe(false);
    // Boutique A garde SON réglage propre (true), inchangée.
    expect(await loadShowStockOverride(organizationId, storeAId)).toBe(true);
  });

  it('un réglage "toutes les boutiques" (sans storeId) sert de défaut à une boutique sans réglage propre', async () => {
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Show Stock Default ${randomUUID()}`],
    );
    const org2Id = org2.rows[0]!.id;
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org2Id],
    );
    await saveShowStockOverride(org2Id, null, false, userId);
    expect(await loadShowStockOverride(org2Id, store2.rows[0]!.id)).toBe(false);
  });

  it('repli sur l\'ancien emplacement unique pos_ui.show_stock si rien d\'autre n\'existe (transition sans migration)', async () => {
    const org3 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Show Stock Legacy ${randomUUID()}`],
    );
    const org3Id = org3.rows[0]!.id;
    const store3 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org3Id],
    );
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'pos_ui', $2::jsonb)`,
      [org3Id, JSON.stringify({ show_stock: false })],
    );
    expect(await loadShowStockOverride(org3Id, store3.rows[0]!.id)).toBe(false);
  });

  async function get(storeId: string | null): Promise<boolean> {
    const url = storeId
      ? `https://x.test/api/settings/pos/show-stock?store_id=${storeId}`
      : 'https://x.test/api/settings/pos/show-stock';
    const res = await showStockGet(new Request(url));
    const body = await res.json() as { show_stock: boolean };
    return body.show_stock;
  }
  async function patch(storeId: string | null, showStock: boolean) {
    return showStockPatch(new Request('https://x.test/api/settings/pos/show-stock', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, show_stock: showStock }),
    }));
  }

  it('API : PATCH sur une boutique ne modifie QUE cette boutique (bout en bout)', async () => {
    const org4 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Show Stock API ${randomUUID()}`],
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
      [org4Id, `ss4-${randomUUID()}@example.test`],
    );
    currentUser = { id: user4.rows[0]!.id, organizationId: org4Id, email: 'x', fullName: 'Testeur', role: 'owner' };

    // État initial : défaut HelloPos (true) pour les deux boutiques.
    expect(await get(s1.rows[0]!.id)).toBe(true);
    expect(await get(s2.rows[0]!.id)).toBe(true);

    const res = await patch(s1.rows[0]!.id, false);
    expect(res.status).toBe(200);

    expect(await get(s1.rows[0]!.id)).toBe(false);
    expect(await get(s2.rows[0]!.id)).toBe(true); // toujours inchangée
  });

  it('API : refuse une boutique d\'une AUTRE organisation', async () => {
    const otherOrg = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Show Stock Other Org ${randomUUID()}`],
    );
    const otherStore = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'XX', 'Autre') RETURNING id`,
      [otherOrg.rows[0]!.id],
    );
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const res = await patch(otherStore.rows[0]!.id, false);
    expect(res.status).toBe(404);
  });

  it('loadAllShowStockOverrides renvoie bien toutes les boutiques réglées, indexées par storeId, false compris', async () => {
    const map = await loadAllShowStockOverrides(organizationId);
    expect(map[storeAId]).toBe(true);
    expect(map[storeBId]).toBe(false);
  });
});
