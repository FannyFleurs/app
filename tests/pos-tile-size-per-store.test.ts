// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import {
  loadTileSizeOverride, loadAllTileSizeOverrides, saveTileSizeOverride,
} from '@/lib/settings/tile-size-server';

/**
 * Bug remonté en production : changer la taille des tuiles ("Apparence des
 * tuiles" — Paramètres > Paramètre caisse) s'appliquait à TOUTES les
 * boutiques de l'organisation, alors que l'utilisateur ne voulait modifier
 * QUE la boutique où le changement était fait.
 *
 * Corrigé en rendant ce réglage PAR BOUTIQUE (clé `pos_tile_size:<storeId>`,
 * même principe que lib/settings/ip-printer-server.ts), avec repli sur un
 * défaut organisation si aucune boutique n'a de réglage propre — y compris
 * un repli supplémentaire sur l'ancien emplacement unique `pos_ui.tile_size`
 * (pour ne pas réinitialiser les organisations déjà configurées).
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: tileSizeGet, PATCH: tileSizePatch } = await import('@/app/api/settings/pos/tile-size/route');

describe.skipIf(!hasDb)('Taille des tuiles — réglage par boutique', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Tile Size ${randomUUID()}`],
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
      [organizationId, `ts-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sans aucun réglage, la valeur effective est null (l\'appelant applique son propre défaut)', async () => {
    expect(await loadTileSizeOverride(organizationId, storeAId)).toBeNull();
  });

  it('change la taille d\'UNE boutique : l\'autre boutique n\'est PAS affectée', async () => {
    await saveTileSizeOverride(organizationId, storeAId, 'xl', userId);
    expect(await loadTileSizeOverride(organizationId, storeAId)).toBe('xl');
    // La boutique B reste sans réglage propre : toujours null (pas "xl").
    expect(await loadTileSizeOverride(organizationId, storeBId)).toBeNull();
  });

  it('un réglage "toutes les boutiques" (sans storeId) sert de défaut à une boutique sans réglage propre', async () => {
    await saveTileSizeOverride(organizationId, null, 'mini', userId);
    // Boutique B (sans réglage propre) reprend le défaut organisation.
    expect(await loadTileSizeOverride(organizationId, storeBId)).toBe('mini');
    // Boutique A garde SON réglage propre, pas affectée par le défaut.
    expect(await loadTileSizeOverride(organizationId, storeAId)).toBe('xl');
  });

  it('repli sur l\'ancien emplacement unique pos_ui.tile_size si rien d\'autre n\'existe (transition sans migration)', async () => {
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Tile Size Legacy ${randomUUID()}`],
    );
    const org2Id = org2.rows[0]!.id;
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org2Id],
    );
    // Ancienne organisation, jamais touchée par le nouveau réglage : seule la
    // clé unique pos_ui existe, avec une taille personnalisée.
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'pos_ui', $2::jsonb)`,
      [org2Id, JSON.stringify({ tile_size: 'large' })],
    );
    expect(await loadTileSizeOverride(org2Id, store2.rows[0]!.id)).toBe('large');
  });

  async function get(storeId: string | null): Promise<string> {
    const url = storeId
      ? `https://x.test/api/settings/pos/tile-size?store_id=${storeId}`
      : 'https://x.test/api/settings/pos/tile-size';
    const res = await tileSizeGet(new Request(url));
    const body = await res.json() as { tile_size: string };
    return body.tile_size;
  }
  async function patch(storeId: string | null, tileSize: string) {
    const res = await tileSizePatch(new Request('https://x.test/api/settings/pos/tile-size', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, tile_size: tileSize }),
    }));
    return res;
  }

  it('API : PATCH sur une boutique ne modifie QUE cette boutique (bout en bout)', async () => {
    const org3 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Tile Size API ${randomUUID()}`],
    );
    const org3Id = org3.rows[0]!.id;
    const s1 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org3Id],
    );
    const s2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [org3Id],
    );
    const user3 = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [org3Id, `ts3-${randomUUID()}@example.test`],
    );
    currentUser = { id: user3.rows[0]!.id, organizationId: org3Id, email: 'x', fullName: 'Testeur', role: 'owner' };

    // État initial : défaut HelloPos ('normal') pour les deux boutiques.
    expect(await get(s1.rows[0]!.id)).toBe('normal');
    expect(await get(s2.rows[0]!.id)).toBe('normal');

    const res = await patch(s1.rows[0]!.id, 'compact');
    expect(res.status).toBe(200);

    expect(await get(s1.rows[0]!.id)).toBe('compact');
    expect(await get(s2.rows[0]!.id)).toBe('normal'); // toujours inchangée
  });

  it('API : refuse une boutique d\'une AUTRE organisation', async () => {
    const otherOrg = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Tile Size Other Org ${randomUUID()}`],
    );
    const otherStore = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'XX', 'Autre') RETURNING id`,
      [otherOrg.rows[0]!.id],
    );
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const res = await patch(otherStore.rows[0]!.id, 'dense');
    expect(res.status).toBe(404);
  });

  it('loadAllTileSizeOverrides renvoie bien toutes les boutiques réglées, indexées par storeId', async () => {
    const map = await loadAllTileSizeOverrides(organizationId);
    expect(map[storeAId]).toBe('xl');
    expect(map[storeBId]).toBeUndefined(); // B n'a pas de réglage PROPRE (juste le défaut org)
  });
});
