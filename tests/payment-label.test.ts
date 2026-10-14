import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { SaleService } from '@/lib/services/sale-service';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { computeDayReport } from '@/lib/services/day-report';

/**
 * Libellé du mode de règlement, figé au moment du paiement.
 *
 * Deux modes personnalisés peuvent partager la même catégorie générique
 * ("Carte Vitrine" et "Paiement Web", tous deux kind='other' côté
 * payment_methods) : sans capturer le libellé exact choisi à l'encaissement,
 * ils deviennent indiscernables après coup et tout retombe sur "Autre" —
 * c'est le bug corrigé ici (voir migrations/0094_payments_label.sql).
 *
 * Intégration contre une VRAIE base Postgres, comme les autres suites
 * *-accounting/*-integration (requêtes SQL trop nombreuses/interdépendantes
 * pour rester crédibles derrière un mock).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));

const { GET: getSale } = await import('@/app/api/sales/[id]/route');

describe.skipIf(!hasDb)('Libellé du mode de règlement — figé à l\'encaissement', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let productId: string;
  let businessDate: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Payment Label ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    currentUser = { id: '', organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PL', 'Plante Verte') RETURNING id`,
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
      [organizationId, `pl-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser.id = userId;

    const taxRate = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate) VALUES ($1, 'STD', '20%', 20) RETURNING id`,
      [organizationId],
    );
    const product = await query<{ id: string }>(
      `INSERT INTO products (organization_id, name, unit, tax_rate_id, sale_price_ttc)
       VALUES ($1, 'Bouquet test', 'unité', $2, 50) RETURNING id`,
      [organizationId, taxRate.rows[0]!.id],
    );
    productId = product.rows[0]!.id;

    businessDate = new Date().toISOString().slice(0, 10);

    await CashSessionService.open({
      organizationId, storeId, registerId, userId, openingFloat: 100,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function saleWithPayment(sId: string, label: string | undefined, amount: number): Promise<string> {
    const draft = await SaleService.createDraft({ organizationId, storeId: sId, registerId, userId });
    await SaleService.setLines(draft.id, organizationId, [{
      product_id: productId, label: 'Bouquet test', unit_price_ttc: amount, quantity: 1,
      tax_rate: 20, tax_rate_code: 'STD',
    }]);
    const res = await SaleService.validate({
      saleId: draft.id, organizationId, userId,
      payments: [{ method: 'other', amount, label }],
    });
    return res.saleId;
  }

  it('le détail de vente renvoie le libellé exact, pas juste la catégorie générique', async () => {
    const saleId = await saleWithPayment(storeId, 'Paiement Web', 43);
    const res = await getSale(new Request('https://x.test'), { params: { id: saleId } });
    expect(res.status).toBe(200);
    const body = await res.json() as { payments: { method: string; label: string | null }[] };
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]).toMatchObject({ method: 'other', label: 'Paiement Web' });
  });

  it('deux modes personnalisés de même catégorie générique restent distincts dans le rapport de journée', async () => {
    // Boutique dédiée à ce test : le rapport de journée scanne par boutique,
    // isole des ventes du test précédent.
    const store2 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PL2', 'Plante Verte 2') RETURNING id`,
      [organizationId],
    );
    const storeId2 = store2.rows[0]!.id;
    const register2 = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R2', 'Caisse 2') RETURNING id`,
      [organizationId, storeId2],
    );
    await CashSessionService.open({
      organizationId, storeId: storeId2, registerId: register2.rows[0]!.id, userId, openingFloat: 100,
    });

    await saleWithPayment(storeId2, 'Carte Vitrine', 30);
    await saleWithPayment(storeId2, 'Paiement Web', 43);
    await saleWithPayment(storeId2, 'Paiement Web', 7); // même libellé, deuxième vente : doit s'additionner
    // Sans libellé (simule une ligne antérieure à cette fonctionnalité, ou un
    // mode natif sans libellé personnalisé) : groupe label=null à part,
    // jamais fusionné avec un libellé réel.
    await saleWithPayment(storeId2, undefined, 20);

    const report = await computeDayReport({
      organizationId, storeId: storeId2, businessDate, kind: 'X', printedAt: new Date().toISOString(),
    });
    const others = report.payments.filter((p) => p.method === 'other');
    expect(others).toHaveLength(3);
    const byLabel = new Map(others.map((p) => [p.label, p.amount]));
    expect(byLabel.get('Carte Vitrine')).toBe(30);
    expect(byLabel.get('Paiement Web')).toBe(50); // 43 + 7, même libellé additionné
    expect(byLabel.get(null)).toBe(20); // sans libellé : groupe séparé, jamais mêlé aux labels réels
  });
});
