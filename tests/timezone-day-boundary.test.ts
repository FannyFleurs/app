// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Une vente tombée à 00h39 heure de Paris apparaissait sur la journée de la
 * VEILLE dans le BO Ventes (et sur le Z/clôture), mais sur la journée du
 * JOUR dans l'app CA — les deux écrans filtraient sur des journées
 * différentes pour la même vente.
 *
 * Cause : les comparaisons SQL `colonne_timestamptz::date = $date` tronquent
 * en UTC (fuseau de session Postgres), pas en Europe/Paris — un écart de
 * +1h/+2h selon la saison. L'app CA utilisait déjà `AT TIME ZONE
 * 'Europe/Paris'` partout ; le BO Ventes (/api/sales/today), le rapport de
 * journée (day-report.ts), l'aperçu et le scellement de clôture
 * (closure-preview.ts, closing-service.ts) et l'historique (day-history.ts)
 * ne l'utilisaient pas — avec, pour la clôture, un vrai risque fiscal : une
 * vente de ce créneau pouvait ne figurer dans AUCUN Z (ni celui de la veille,
 * déjà scellé avant qu'elle n'existe, ni celui du jour, dont le filtre UTC
 * la manquait).
 *
 * 15 juin 2025 (CEST, UTC+2, hors ambiguïté de changement d'heure) :
 * 00h39 Paris = 14/06 22h39 UTC → la vente doit compter sur la journée du
 * 15 juin, pas du 14.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: currentUser }),
  requirePermission: async () => ({ user: currentUser }),
}));

const { GET: salesTodayGet } = await import('@/app/api/sales/today/route');
const { GET: caTicketsGet } = await import('@/app/api/ca/tickets/route');
const { computeDayReport } = await import('@/lib/services/day-report');
const { ClosingService } = await import('@/lib/services/closing-service');

describe.skipIf(!hasDb)('Fuseau horaire : journée commerciale en Europe/Paris, pas en UTC', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let saleId: string;
  // 00h39 Paris le 15/06 (CEST, UTC+2) = 22h39 UTC le 14/06.
  const VALIDATED_AT_UTC = '2025-06-14T22:39:00Z';
  const BUSINESS_DAY = '2025-06-15';
  const PREVIOUS_DAY = '2025-06-14';

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test TZ Boundary ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'TZ', 'Boutique TZ') RETURNING id`,
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
      [organizationId, `tz-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         validated_at, total_ttc, total_ht, total_tva, receipt_number)
       VALUES ($1, $2, $3, $4, 'validated', $5, 58, 52.73, 5.27, 'T-TZ-0001') RETURNING id`,
      [organizationId, storeId, registerId, userId, VALIDATED_AT_UTC],
    );
    saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Bouquet nuit', 58, 1, 10, 'TVA10', 52.73, 5.27, 58)`,
      [organizationId, saleId],
    );
    await query(
      `INSERT INTO payments (organization_id, sale_id, method, amount)
       VALUES ($1, $2, 'card', 58)`,
      [organizationId, saleId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('BO Ventes (/api/sales/today) : la vente compte sur le 15, pas sur le 14', async () => {
    const onDay = await salesTodayGet(new Request(
      `https://x.test/api/sales/today?date=${BUSINESS_DAY}&store_id=${storeId}`,
    ));
    const onDayBody = await onDay.json() as { sales: { id: string }[] };
    expect(onDayBody.sales.map((s) => s.id)).toContain(saleId);

    const onPrevDay = await salesTodayGet(new Request(
      `https://x.test/api/sales/today?date=${PREVIOUS_DAY}&store_id=${storeId}`,
    ));
    const onPrevDayBody = await onPrevDay.json() as { sales: { id: string }[] };
    expect(onPrevDayBody.sales.map((s) => s.id)).not.toContain(saleId);
  });

  it('App CA (/api/ca/tickets) : même journée que le BO (les deux s\'accordent)', async () => {
    const r = await caTicketsGet(new Request(
      `https://x.test/api/ca/tickets?from=${BUSINESS_DAY}&to=${BUSINESS_DAY}&store_id=${storeId}`,
    ));
    const body = await r.json() as { tickets: { id: string }[] };
    expect(body.tickets.map((t) => t.id)).toContain(saleId);
  });

  it('Rapport de journée (X/Z) : la vente est comptée le 15 juin, exclue le 14', async () => {
    const reportOnDay = await computeDayReport({
      organizationId, storeId, businessDate: BUSINESS_DAY, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(reportOnDay.totals.ticket_count).toBe(1);
    expect(reportOnDay.totals.ca_ttc).toBe(58);

    const reportPrevDay = await computeDayReport({
      organizationId, storeId, businessDate: PREVIOUS_DAY, kind: 'X', printedAt: new Date().toISOString(),
    });
    expect(reportPrevDay.totals.ticket_count).toBe(0);
  });

  it('Scellement de clôture (Z) : la vente est incluse dans le Z du 15 juin', async () => {
    const result = await ClosingService.sealDaily({
      organizationId, storeId, userId, businessDate: BUSINESS_DAY, countedCash: 0,
    });
    expect(result.totals.total_sales).toBe(1);
    expect(result.totals.total_ttc).toBe(58);
  });
});
