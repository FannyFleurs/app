// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Bug remonté en production : sur l'app CA (/api/ca/summary,
 * /api/ca/summary-by-store), une période ANTÉRIEURE à l'usage de HelloPos
 * (ex. 5 mars – 31 juillet), importée via l'historique de CA
 * (revenue_history, migration 0076), ressortait à zéro — alors que le
 * tableau de bord back-office (/api/analytics/dashboard, qui blend déjà
 * sales + revenue_history) l'affichait correctement. Cause : ces deux
 * routes /api/ca/* ne consultaient jamais revenue_history.
 *
 * Corrigé en ADDITIONNANT (lib/analytics/revenue-blend.ts) l'import pour
 * les seuls jours SANS vente réelle, plutôt qu'en remplaçant le calcul réel
 * existant — qui exclut délibérément les lignes d'émission de carte cadeau
 * du CA (voir le commentaire de /api/ca/summary). Un remplacement aurait
 * réintroduit ces montants dans le CA des jours AVEC vente réelle.
 *
 * Intégration contre une VRAIE base Postgres (comme les autres suites
 * d'intégration *-stripe- et *-scoping).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: currentUser }),
}));

const { GET: summaryGet } = await import('@/app/api/ca/summary/route');
const { GET: summaryByStoreGet } = await import('@/app/api/ca/summary-by-store/route');
const { GET: dashboardGet } = await import('@/app/api/analytics/dashboard/route');

describe.skipIf(!hasDb)('App CA — le CA importé (revenue_history) comble les jours sans vente réelle', () => {
  let organizationId: string;
  let storeId: string;
  let store2Id: string;
  let registerId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Revenue History ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [organizationId],
    );
    store2Id = store2.rows[0]!.id;

    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `ca-rh-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Historique importé : 10 mars (aucune vente réelle ce jour-là) — le cas
    // "période antérieure à HelloPos" du rapport.
    await query(
      `INSERT INTO revenue_history (organization_id, store_id, day, ca_ttc, ca_ht, tickets)
       VALUES ($1, $2, '2025-03-10', 100.00, 90.00, 3)`,
      [organizationId, storeId],
    );
    // Import PILE sur un jour qui a AUSSI une vraie vente (15 mars) : la
    // vente réelle doit l'emporter, l'import ne doit pas s'additionner.
    await query(
      `INSERT INTO revenue_history (organization_id, store_id, day, ca_ttc, ca_ht, tickets)
       VALUES ($1, $2, '2025-03-15', 999.00, 900.00, 50)`,
      [organizationId, storeId],
    );

    // Vente réelle le 15 mars, 50 € TTC.
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, validated_at, total_ttc, total_ht)
       VALUES ($1, $2, $3, $4, 'validated', '2025-03-15T10:00:00Z', 50.00, 45.45) RETURNING id`,
      [organizationId, storeId, registerId, userId],
    );
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Bouquet', 50.00, 1, 10, 'TVA10', 45.45, 4.55, 50.00)`,
      [organizationId, sale.rows[0]!.id],
    );
  });

  it('GET /api/ca/summary : une période antérieure couverte UNIQUEMENT par l\'import ne ressort plus à zéro', async () => {
    const url = `https://x.test/api/ca/summary?from=2025-03-10&to=2025-03-10&store_id=${storeId}`;
    const res = await summaryGet(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json() as { ca_ttc: number; ca_ht: number; tickets_count: number };
    expect(body.ca_ttc).toBe(100);
    expect(body.ca_ht).toBe(90);
    expect(body.tickets_count).toBe(3);
  });

  it('GET /api/ca/summary : un jour avec vente réelle n\'additionne PAS l\'import du même jour', async () => {
    const url = `https://x.test/api/ca/summary?from=2025-03-15&to=2025-03-15&store_id=${storeId}`;
    const res = await summaryGet(new Request(url));
    const body = await res.json() as { ca_ttc: number; tickets_count: number };
    // 50 € réels, PAS 50 + 999 — la vente réelle du jour l'emporte sur l'import du même jour.
    expect(body.ca_ttc).toBe(50);
    expect(body.tickets_count).toBe(1);
  });

  it('GET /api/ca/summary : une période mélangeant jour importé + jour réel additionne correctement les deux', async () => {
    const url = `https://x.test/api/ca/summary?from=2025-03-10&to=2025-03-15&store_id=${storeId}`;
    const res = await summaryGet(new Request(url));
    const body = await res.json() as { ca_ttc: number; tickets_count: number };
    expect(body.ca_ttc).toBe(150); // 100 importé (10 mars) + 50 réel (15 mars)
    expect(body.tickets_count).toBe(4); // 3 importés + 1 réel
  });

  it('GET /api/ca/summary-by-store : la boutique couverte par l\'import apparaît, l\'autre (sans rien) reste à zéro', async () => {
    const url = `https://x.test/api/ca/summary-by-store?from=2025-03-10&to=2025-03-10`;
    const res = await summaryByStoreGet(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json() as { stores: { store_id: string; ca_ttc: number; tickets_count: number }[] };
    const s1 = body.stores.find((s) => s.store_id === storeId);
    const s2 = body.stores.find((s) => s.store_id === store2Id);
    expect(s1?.ca_ttc).toBe(100);
    expect(s1?.tickets_count).toBe(3);
    expect(s2?.ca_ttc).toBe(0);
  });
});

/**
 * revenue_history.additive (migration 0090) : migration vers HelloPos en
 * plusieurs étapes (ex. web/OGF déjà en production avant le déploiement de
 * la caisse physique en boutique). Un import marqué additif s'ADDITIONNE au
 * CA réel déjà saisi, même les jours qui ont du CA réel — contrairement au
 * comportement par défaut (additive = FALSE) testé ci-dessus, qui ne comble
 * que les jours sans aucune vente réelle.
 */
describe.skipIf(!hasDb)('revenue_history.additive — le CA importé s\'additionne au CA réel (migration en plusieurs étapes)', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Revenue History Additive ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;

    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `ca-rh-add-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // 10 octobre : CA réel déjà dans HelloPos (ex. une commande web/OGF),
    // 120 € TTC — AVANT le déploiement de la caisse physique.
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, validated_at, total_ttc, total_ht)
       VALUES ($1, $2, $3, $4, 'validated', '2026-10-10T10:00:00Z', 120.00, 109.09) RETURNING id`,
      [organizationId, storeId, registerId, userId],
    );
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Commande web', 120.00, 1, 10, 'TVA10', 109.09, 10.91, 120.00)`,
      [organizationId, sale.rows[0]!.id],
    );

    // Import ADDITIF du 10 octobre : CA de la boutique physique (ancien
    // système), 200 € — doit s'ADDITIONNER aux 120 € déjà réels, pas les
    // remplacer ni être ignoré.
    await query(
      `INSERT INTO revenue_history (organization_id, store_id, day, ca_ttc, ca_ht, tickets, additive)
       VALUES ($1, $2, '2026-10-10', 200.00, 180.00, 5, TRUE)`,
      [organizationId, storeId],
    );
    // Import NON additif (par défaut) du 11 octobre, lui aussi sur un jour
    // AVEC vente réelle — pour vérifier qu'il reste bien ignoré (régression).
    const sale2 = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, validated_at, total_ttc, total_ht)
       VALUES ($1, $2, $3, $4, 'validated', '2026-10-11T10:00:00Z', 30.00, 27.27) RETURNING id`,
      [organizationId, storeId, registerId, userId],
    );
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Commande web', 30.00, 1, 10, 'TVA10', 27.27, 2.73, 30.00)`,
      [organizationId, sale2.rows[0]!.id],
    );
    await query(
      `INSERT INTO revenue_history (organization_id, store_id, day, ca_ttc, ca_ht, tickets, additive)
       VALUES ($1, $2, '2026-10-11', 999.00, 900.00, 50, FALSE)`,
      [organizationId, storeId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /api/ca/summary : un import additif s\'ajoute au CA réel du même jour', async () => {
    const url = `https://x.test/api/ca/summary?from=2026-10-10&to=2026-10-10&store_id=${storeId}`;
    const res = await summaryGet(new Request(url));
    const body = await res.json() as { ca_ttc: number; ca_ht: number; tickets_count: number };
    expect(body.ca_ttc).toBe(320); // 120 réel + 200 importé (additif)
    expect(body.ca_ht).toBeCloseTo(289.09, 2);
    expect(body.tickets_count).toBe(6); // 1 réel + 5 importés
  });

  it('GET /api/ca/summary : un import NON additif reste ignoré sur un jour avec vente réelle (régression)', async () => {
    const url = `https://x.test/api/ca/summary?from=2026-10-11&to=2026-10-11&store_id=${storeId}`;
    const res = await summaryGet(new Request(url));
    const body = await res.json() as { ca_ttc: number; tickets_count: number };
    expect(body.ca_ttc).toBe(30); // réel seul, PAS 30 + 999
    expect(body.tickets_count).toBe(1);
  });

  it('GET /api/analytics/dashboard : le CA du jour (summary.current) additionne le CA réel et l\'import additif', async () => {
    const url = `https://x.test/api/analytics/dashboard?from=2026-10-10&to=2026-10-10&store_id=${storeId}`;
    const res = await dashboardGet(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: { current: { ca_ttc: number; tickets: number } } };
    expect(body.summary.current.ca_ttc).toBe(320);
    expect(body.summary.current.tickets).toBe(6);
  });

  it('GET /api/analytics/dashboard : la série journalière reflète aussi l\'addition sur le jour concerné', async () => {
    const url = `https://x.test/api/analytics/dashboard?from=2026-10-10&to=2026-10-11&store_id=${storeId}`;
    const res = await dashboardGet(new Request(url));
    const body = await res.json() as { daily: { labels: string[]; ca_ttc: number[] } };
    expect(body.daily.ca_ttc).toEqual([320, 30]);
  });
});
