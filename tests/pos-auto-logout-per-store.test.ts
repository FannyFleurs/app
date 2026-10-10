// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import {
  loadAutoLogoutOverride, loadAllAutoLogoutOverrides, saveAutoLogoutOverride,
} from '@/lib/settings/auto-logout-server';

/**
 * Demande remontée en production : le mode de déconnexion automatique
 * (verrouillage caisse) — "après inactivité" (durée réglable), "après une
 * vente" ou "jamais" — s'appliquait à TOUTE l'organisation, alors que
 * l'utilisateur veut pouvoir le régler indépendamment PAR BOUTIQUE.
 *
 * Corrigé en rendant ce réglage PAR BOUTIQUE (clé `pos_auto_logout:<storeId>`,
 * même principe que lib/settings/tile-size-server.ts), avec repli sur un
 * défaut organisation si aucune boutique n'a de réglage propre — y compris
 * un repli supplémentaire sur l'ancien emplacement unique
 * `pos_ui.auto_logout_mode` / `.auto_logout_minutes` (pour ne pas
 * réinitialiser les organisations déjà configurées).
 *
 * Le MÉCANISME de déconnexion (écran de connexion / code PIN) n'est volontairement
 * PAS modifié — seul ce qui déclenche sa valeur devient paramétrable par
 * boutique ; voir components/AppShell.tsx, inchangé.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: autoLogoutGet, PATCH: autoLogoutPatch } = await import('@/app/api/settings/pos/auto-logout/route');

describe.skipIf(!hasDb)('Déconnexion automatique — réglage par boutique', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Auto Logout ${randomUUID()}`],
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
      [organizationId, `al-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sans aucun réglage, la valeur effective est null (l\'appelant applique son propre défaut)', async () => {
    expect(await loadAutoLogoutOverride(organizationId, storeAId)).toBeNull();
  });

  it('change le mode d\'UNE boutique : l\'autre boutique n\'est PAS affectée', async () => {
    await saveAutoLogoutOverride(organizationId, storeAId, { auto_logout_mode: 'timer', auto_logout_minutes: 5 }, userId);
    expect(await loadAutoLogoutOverride(organizationId, storeAId)).toEqual({ auto_logout_mode: 'timer', auto_logout_minutes: 5 });
    // La boutique B reste sans réglage propre : toujours null (pas "timer").
    expect(await loadAutoLogoutOverride(organizationId, storeBId)).toBeNull();
  });

  it('un réglage "toutes les boutiques" (sans storeId) sert de défaut à une boutique sans réglage propre', async () => {
    await saveAutoLogoutOverride(organizationId, null, { auto_logout_mode: 'after_sale', auto_logout_minutes: 10 }, userId);
    // Boutique B (sans réglage propre) reprend le défaut organisation.
    expect(await loadAutoLogoutOverride(organizationId, storeBId)).toEqual({ auto_logout_mode: 'after_sale', auto_logout_minutes: 10 });
    // Boutique A garde SON réglage propre, pas affectée par le défaut.
    expect(await loadAutoLogoutOverride(organizationId, storeAId)).toEqual({ auto_logout_mode: 'timer', auto_logout_minutes: 5 });
  });

  it('repli sur l\'ancien emplacement unique pos_ui.auto_logout_mode si rien d\'autre n\'existe (transition sans migration)', async () => {
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Auto Logout Legacy ${randomUUID()}`],
    );
    const org2Id = org2.rows[0]!.id;
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [org2Id],
    );
    // Ancienne organisation, jamais touchée par le nouveau réglage : seule la
    // clé unique pos_ui existe, avec un mode personnalisé.
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'pos_ui', $2::jsonb)`,
      [org2Id, JSON.stringify({ auto_logout_mode: 'timer', auto_logout_minutes: 20 })],
    );
    expect(await loadAutoLogoutOverride(org2Id, store2.rows[0]!.id)).toEqual({ auto_logout_mode: 'timer', auto_logout_minutes: 20 });
  });

  async function get(storeId: string | null): Promise<{ auto_logout_mode: string; auto_logout_minutes: number }> {
    const url = storeId
      ? `https://x.test/api/settings/pos/auto-logout?store_id=${storeId}`
      : 'https://x.test/api/settings/pos/auto-logout';
    const res = await autoLogoutGet(new Request(url));
    return res.json() as Promise<{ auto_logout_mode: string; auto_logout_minutes: number }>;
  }
  async function patch(storeId: string | null, mode: string, minutes: number) {
    return autoLogoutPatch(new Request('https://x.test/api/settings/pos/auto-logout', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, auto_logout_mode: mode, auto_logout_minutes: minutes }),
    }));
  }

  it('API : PATCH sur une boutique ne modifie QUE cette boutique (bout en bout)', async () => {
    const org3 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Auto Logout API ${randomUUID()}`],
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
      [org3Id, `al3-${randomUUID()}@example.test`],
    );
    currentUser = { id: user3.rows[0]!.id, organizationId: org3Id, email: 'x', fullName: 'Testeur', role: 'owner' };

    // État initial : défaut HelloPos ('never') pour les deux boutiques.
    expect((await get(s1.rows[0]!.id)).auto_logout_mode).toBe('never');
    expect((await get(s2.rows[0]!.id)).auto_logout_mode).toBe('never');

    const res = await patch(s1.rows[0]!.id, 'timer', 15);
    expect(res.status).toBe(200);

    const s1After = await get(s1.rows[0]!.id);
    expect(s1After.auto_logout_mode).toBe('timer');
    expect(s1After.auto_logout_minutes).toBe(15);
    expect((await get(s2.rows[0]!.id)).auto_logout_mode).toBe('never'); // toujours inchangée
  });

  it('API : refuse une boutique d\'une AUTRE organisation', async () => {
    const otherOrg = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Auto Logout Other Org ${randomUUID()}`],
    );
    const otherStore = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'XX', 'Autre') RETURNING id`,
      [otherOrg.rows[0]!.id],
    );
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const res = await patch(otherStore.rows[0]!.id, 'after_sale', 10);
    expect(res.status).toBe(404);
  });

  it('API : rejette une minute hors bornes (1-120)', async () => {
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const res = await patch(storeAId, 'timer', 0);
    expect(res.status).toBe(422);
  });

  it('loadAllAutoLogoutOverrides renvoie bien toutes les boutiques réglées, indexées par storeId', async () => {
    const map = await loadAllAutoLogoutOverrides(organizationId);
    expect(map[storeAId]).toEqual({ auto_logout_mode: 'timer', auto_logout_minutes: 5 });
    expect(map[storeBId]).toBeUndefined(); // B n'a pas de réglage PROPRE (juste le défaut org)
  });
});
