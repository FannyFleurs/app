// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Trois écrans (tableau de bord, app CA, export comptable) donnaient trois
 * CA différents pour le même mois — faute d'appliquer partout la même règle
 * comptable : l'émission d'une carte cadeau / bon d'achat est un encaissement
 * (une dette envers le client), PAS du chiffre d'affaires, tant qu'elle n'est
 * pas dépensée. Voir lib/analytics/gift-card-ca.ts.
 *
 * Ce fichier vérifie que toutes les routes de CA de l'application
 * s'accordent désormais sur le MÊME montant, pour la même vente contenant un
 * produit réel (100€ HT, 120€ TTC, TVA 20%) ET une carte cadeau vendue
 * (50€, TVA 0%, exclue du CA) :
 *   - CA réel attendu  : 100€ HT / 20€ TVA / 120€ TTC
 *   - Carte cadeau     : 50€ (hors CA, encaissement séparé)
 *   - CA brut (ancien calcul fautif, sales.total_ttc) : 170€ — ne doit plus
 *     apparaître nulle part.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: currentUser }),
  requirePermission: async () => ({ user: currentUser }),
}));

const { GET: dashboardGet } = await import('@/app/api/analytics/dashboard/route');
const { GET: caSummaryGet } = await import('@/app/api/ca/summary/route');
const { GET: caSummaryByStoreGet } = await import('@/app/api/ca/summary-by-store/route');
const { GET: caHourlyGet } = await import('@/app/api/ca/hourly/route');
const { GET: caVendorsGet } = await import('@/app/api/ca/vendors/route');
const { GET: caProductsGet } = await import('@/app/api/ca/products/route');
const { GET: caTvaGet } = await import('@/app/api/ca/tva/route');
const { GET: reportsSalesGet } = await import('@/app/api/reports/sales/route');
const { GET: reportsSaleLinesGet } = await import('@/app/api/reports/sale-lines/route');
const { computeClosurePreview } = await import('@/lib/services/closure-preview');

describe.skipIf(!hasDb)('CA : même calcul partout (carte cadeau exclue du CA)', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  const DAY = '2026-10-10'; // un seul jour, pour simplifier hourly/tva/vendors.

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Gift Card CA ${randomUUID()}`],
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
      [organizationId, `gcca-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Une vente : 1 produit réel (100€ HT / 20€ TVA / 120€ TTC, TVA 20%)
    // + 1 carte cadeau (50€, TVA 0%, metadata gift_card + gift_card_ca_deferred).
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         validated_at, total_ttc, total_ht, total_tva, receipt_number)
       VALUES ($1, $2, $3, $4, 'validated', $5, 170, 150, 20, 'R-0001') RETURNING id`,
      [organizationId, storeId, registerId, userId, `${DAY}T10:00:00Z`],
    );
    const saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Bouquet', 120, 1, 20, 'TVA20', 100, 20, 120)`,
      [organizationId, saleId],
    );
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, metadata)
       VALUES ($1, $2, 1, 'Carte cadeau', 50, 1, 0, 'CADEAU', 50, 0, 50, $3::jsonb)`,
      [organizationId, saleId, JSON.stringify({ gift_card: true, gift_card_ca_deferred: true })],
    );
    await query(
      `INSERT INTO payments (organization_id, sale_id, method, amount)
       VALUES ($1, $2, 'cash', 170)`,
      [organizationId, saleId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('tableau de bord : CA = 120€ TTC / 100€ HT / 20€ TVA (carte cadeau exclue)', async () => {
    const res = await dashboardGet(new Request(
      `https://x.test/api/analytics/dashboard?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    expect(res.status).toBe(200);
    const body = await res.json() as { summary: { current: { ca_ttc: number; ca_ht: number; tva: number; tickets: number } } };
    expect(body.summary.current.ca_ttc).toBe(120);
    expect(body.summary.current.ca_ht).toBe(100);
    expect(body.summary.current.tva).toBe(20);
    expect(body.summary.current.tickets).toBe(1); // le ticket reste compté
  });

  it('app CA — résumé global : même CA que le tableau de bord', async () => {
    const res = await caSummaryGet(new Request(
      `https://x.test/api/ca/summary?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    const body = await res.json() as { ca_ttc: number; ca_ht: number; tva: number; tickets_count: number };
    expect(body.ca_ttc).toBe(120);
    expect(body.ca_ht).toBe(100);
    expect(body.tva).toBe(20);
    expect(body.tickets_count).toBe(1);
  });

  it('app CA — par boutique : même CA', async () => {
    const res = await caSummaryByStoreGet(new Request(
      `https://x.test/api/ca/summary-by-store?from=${DAY}&to=${DAY}`,
    ));
    const body = await res.json() as { stores: { store_id: string; ca_ttc: number; tickets_count: number }[] };
    const s = body.stores.find((x) => x.store_id === storeId);
    expect(s?.ca_ttc).toBe(120);
    expect(s?.tickets_count).toBe(1);
  });

  it('app CA — par heure : même CA', async () => {
    const res = await caHourlyGet(new Request(
      `https://x.test/api/ca/hourly?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    const body = await res.json() as { hours: { ca_ttc: number; tickets_count: number }[] };
    const totalTtc = body.hours.reduce((s, h) => s + h.ca_ttc, 0);
    const totalTickets = body.hours.reduce((s, h) => s + h.tickets_count, 0);
    expect(totalTtc).toBe(120);
    expect(totalTickets).toBe(1);
  });

  it('app CA — par vendeur : même CA', async () => {
    const res = await caVendorsGet(new Request(
      `https://x.test/api/ca/vendors?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    const body = await res.json() as { vendors: { ca_ttc: number; tickets_count: number }[] };
    expect(body.vendors[0]?.ca_ttc).toBe(120);
    expect(body.vendors[0]?.tickets_count).toBe(1);
  });

  it('app CA — produits : la carte cadeau n\'apparaît pas dans la liste', async () => {
    const res = await caProductsGet(new Request(
      `https://x.test/api/ca/products?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    const body = await res.json() as { products: { product_name: string; ca_ttc: number }[] };
    expect(body.products).toHaveLength(1);
    expect(body.products[0]?.product_name).toBe('Bouquet');
    expect(body.products[0]?.ca_ttc).toBe(120);
  });

  it('app CA — TVA : la carte cadeau n\'inflate pas la tranche 0%', async () => {
    const res = await caTvaGet(new Request(
      `https://x.test/api/ca/tva?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    const body = await res.json() as { tva: { rate: number; ttc: number }[] };
    expect(body.tva).toHaveLength(1); // seule la tranche 20% apparaît
    expect(body.tva[0]?.rate).toBe(20);
    expect(body.tva[0]?.ttc).toBe(120);
  });

  it('rapport back-office "Ventes" : même CA', async () => {
    const res = await reportsSalesGet(new Request(
      `https://x.test/api/reports/sales?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    const body = await res.json() as { totals: { ttc: number; ht: number; tva: number; tickets: number } };
    expect(body.totals.ttc).toBe(120);
    expect(body.totals.ht).toBe(100);
    expect(body.totals.tva).toBe(20);
    expect(body.totals.tickets).toBe(1);
  });

  it('rapport back-office "Lignes de vente" : la carte cadeau n\'apparaît pas', async () => {
    const res = await reportsSaleLinesGet(new Request(
      `https://x.test/api/reports/sale-lines?from=${DAY}&to=${DAY}&store_id=${storeId}`,
    ));
    const body = await res.json() as { lines: { label: string; ttc: number }[] };
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.label).toBe('Bouquet');
    expect(body.lines[0]?.ttc).toBe(120);
  });

  it('aperçu de clôture (avant scellement) : même CA que la clôture scellée produirait', async () => {
    const preview = await computeClosurePreview(storeId, DAY);
    expect(preview.totals.ttc).toBe(120);
    expect(preview.totals.ht).toBe(100);
    expect(preview.totals.tva).toBe(20);
    expect(preview.totals.sales).toBe(1);
    expect(preview.tva_breakdown).toHaveLength(1);
    expect(preview.tva_breakdown[0]?.rate).toBe(20);
  });
});
