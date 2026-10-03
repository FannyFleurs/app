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

  afterAll(async () => {
    await pool.end();
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
