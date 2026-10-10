// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Bug remonté en production (app CA, filtre "Ce mois") : le total affiché ne
 * correspondait pas à la réalité. Cause : toutes les routes /api/ca/*
 * comparaient `s.validated_at::date` (date UTC brute) aux bornes from/to
 * demandées, au lieu de convertir d'abord en heure de Paris — contrairement
 * au tableau de bord back-office (/api/analytics/dashboard), qui le fait
 * déjà correctement partout (`(s.validated_at AT TIME ZONE 'Europe/Paris')::date`).
 *
 * Une vente validée tôt le matin heure de Paris (ex. 00h30, hiver UTC+1)
 * tombe alors sur la date UTC de LA VEILLE — elle disparaissait du jour où
 * elle a réellement eu lieu côté app CA, et apparaissait sur le jour
 * précédent à la place. L'effet grandit avec la largeur de la période
 * ("Ce mois" plus exposé que "Aujourd'hui").
 *
 * (Note : pas de vente annulée en cause ici — `s.status = 'validated'` était
 * déjà correctement filtré partout ; vérifié en investiguant ce rapport.)
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: currentUser }),
}));

const { GET: summaryGet } = await import('@/app/api/ca/summary/route');
const { GET: summaryByStoreGet } = await import('@/app/api/ca/summary-by-store/route');
const { GET: hourlyGet } = await import('@/app/api/ca/hourly/route');
const { GET: vendorsGet } = await import('@/app/api/ca/vendors/route');
const { GET: productsGet } = await import('@/app/api/ca/products/route');
const { GET: tvaGet } = await import('@/app/api/ca/tva/route');
const { GET: discountsGet } = await import('@/app/api/ca/discounts/route');
const { GET: ticketsGet } = await import('@/app/api/ca/tickets/route');

describe.skipIf(!hasDb)('App CA — bornes de date converties en heure de Paris (pas en UTC brut)', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Timezone ${randomUUID()}`],
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
      [organizationId, `ca-tz-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Vente validée le 15 février 2026 à 00h30 heure de Paris (hiver, UTC+1)
    // = 14 février 2026 23h30 UTC. Date UTC brute (14) ≠ date Paris réelle (15).
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, validated_at, total_ttc, total_ht, receipt_number)
       VALUES ($1, $2, $3, $4, 'validated', '2026-02-14T23:30:00Z', 77.00, 70.00, 'R-0001') RETURNING id`,
      [organizationId, storeId, registerId, userId],
    );
    const saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Bouquet', 77.00, 1, 10, 'TVA10', 70.00, 7.00, 77.00)`,
      [organizationId, saleId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /api/ca/summary : la vente compte sur le 15 février (jour Paris réel), pas le 14 (jour UTC)', async () => {
    const on15 = await summaryGet(new Request(
      `https://x.test/api/ca/summary?from=2026-02-15&to=2026-02-15&store_id=${storeId}`,
    ));
    const body15 = await on15.json() as { ca_ttc: number; tickets_count: number };
    expect(body15.ca_ttc).toBe(77);
    expect(body15.tickets_count).toBe(1);

    const on14 = await summaryGet(new Request(
      `https://x.test/api/ca/summary?from=2026-02-14&to=2026-02-14&store_id=${storeId}`,
    ));
    const body14 = await on14.json() as { ca_ttc: number; tickets_count: number };
    expect(body14.ca_ttc).toBe(0);
    expect(body14.tickets_count).toBe(0);
  });

  it('GET /api/ca/summary-by-store : même correction sur la vue par boutique', async () => {
    const res = await summaryByStoreGet(new Request(
      `https://x.test/api/ca/summary-by-store?from=2026-02-15&to=2026-02-15`,
    ));
    const body = await res.json() as { stores: { store_id: string; ca_ttc: number }[] };
    expect(body.stores.find((s) => s.store_id === storeId)?.ca_ttc).toBe(77);
  });

  it('GET /api/ca/hourly : rattachée au 15 février, pas au 14', async () => {
    const res = await hourlyGet(new Request(
      `https://x.test/api/ca/hourly?from=2026-02-15&to=2026-02-15&store_id=${storeId}`,
    ));
    const body = await res.json() as { hours: { ca_ttc: number }[] };
    expect(body.hours.reduce((sum, h) => sum + h.ca_ttc, 0)).toBe(77);
  });

  it('GET /api/ca/vendors : rattachée au 15 février, pas au 14', async () => {
    const res = await vendorsGet(new Request(
      `https://x.test/api/ca/vendors?from=2026-02-15&to=2026-02-15&store_id=${storeId}`,
    ));
    const body = await res.json() as { vendors: { ca_ttc: number }[] };
    expect(body.vendors.reduce((sum, v) => sum + v.ca_ttc, 0)).toBe(77);
  });

  it('GET /api/ca/products : rattachée au 15 février, pas au 14', async () => {
    const res = await productsGet(new Request(
      `https://x.test/api/ca/products?from=2026-02-15&to=2026-02-15&store_id=${storeId}`,
    ));
    const body = await res.json() as { products: { ca_ttc: number }[] };
    expect(body.products.reduce((sum, p) => sum + p.ca_ttc, 0)).toBe(77);
  });

  it('GET /api/ca/tva : rattachée au 15 février, pas au 14', async () => {
    const res = await tvaGet(new Request(
      `https://x.test/api/ca/tva?from=2026-02-15&to=2026-02-15&store_id=${storeId}`,
    ));
    const body = await res.json() as { tva: { ttc: number }[] };
    expect(body.tva.reduce((sum, b) => sum + b.ttc, 0)).toBe(77);
  });

  it('GET /api/ca/tickets : rattachée au 15 février, pas au 14', async () => {
    const res = await ticketsGet(new Request(
      `https://x.test/api/ca/tickets?from=2026-02-15&to=2026-02-15&store_id=${storeId}`,
    ));
    const body = await res.json() as { tickets: { total_ttc: string }[] };
    expect(body.tickets).toHaveLength(1);

    const res14 = await ticketsGet(new Request(
      `https://x.test/api/ca/tickets?from=2026-02-14&to=2026-02-14&store_id=${storeId}`,
    ));
    const body14 = await res14.json() as { tickets: unknown[] };
    expect(body14.tickets).toHaveLength(0);
  });

  it('GET /api/ca/discounts : borne de date convertie (aucune remise ici, vérifie juste l\'absence d\'erreur sur la plage)', async () => {
    const res = await discountsGet(new Request(
      `https://x.test/api/ca/discounts?from=2026-02-15&to=2026-02-15&store_id=${storeId}`,
    ));
    expect(res.status).toBe(200);
  });
});
