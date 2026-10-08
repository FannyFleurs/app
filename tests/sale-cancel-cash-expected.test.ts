import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { SaleCancelService } from '@/lib/services/sale-cancel-service';
import { computeDayReport } from '@/lib/services/day-report';

/**
 * Bug remonté en production : après annulation d'une vente payée en
 * espèces LE JOUR MÊME, le bloc « Trésorerie espèces » de Ma journée était
 * faux — « Espèces attendues » retombait SOUS le fond de caisse, et « Autres
 * mouvements » devenait négatif, alors que l'annulation d'une vente du jour
 * doit ramener exactement au fond de caisse (rien n'a changé).
 *
 * Cause : SaleCancelService insérait TOUJOURS un mouvement de caisse 'out'
 * (« sortie du tiroir ») à l'annulation d'un paiement espèces. Pour une vente
 * annulée LE JOUR MÊME, cette sortie est une SECONDE soustraction : la vente
 * annulée (status ≠ 'validated') est déjà exclue de la somme des ventes
 * espèces du jour dans lib/services/day-report.ts (cashExpected = fond de
 * caisse + ventes espèces + entrées - sorties) — l'exclusion suffit à elle
 * seule à neutraliser son effet.
 *
 * Pour une vente annulée un AUTRE jour que celui de sa validation, en
 * revanche, cette sortie reste nécessaire : le rapport du jour de vente est
 * déjà scellé/figé, et la sortie d'espèces (remboursement) a lieu
 * physiquement AUJOURD'HUI — elle doit apparaître dans le rapport du jour de
 * l'annulation.
 *
 * Intégration contre une VRAIE base Postgres (comme les autres suites
 * d'intégration *-stripe- et *-scoping).
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('SaleCancelService — « Espèces attendues » après annulation d\'une vente espèces', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  // Boutique SÉPARÉE pour le 2e test : computeDayReport agrège par
  // (boutique, jour) — deux sessions ouvertes le même jour dans la MÊME
  // boutique s'additionneraient (fond de caisse cumulé), ce qui fausserait
  // les assertions d'un test à l'autre. Isoler par boutique évite toute
  // contamination entre les deux scénarios.
  let storeId2: string;
  let registerId2: string;
  let userId: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Sale Cancel Cash ${randomUUID()}`],
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
    storeId2 = store2.rows[0]!.id;

    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const register2 = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeId2],
    );
    registerId2 = register2.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `scc-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  /** Insère directement une vente VALIDÉE + 1 paiement espèces, à une date donnée. */
  async function insertCashSale(
    amount: number, validatedAt: string,
    store = storeId, register = registerId,
  ): Promise<string> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales
         (organization_id, store_id, register_id, user_id, status, validated_at,
          total_ht, total_tva, total_ttc, receipt_number)
       VALUES ($1,$2,$3,$4,'validated',$5,$6,$7,$8,$9) RETURNING id`,
      [
        organizationId, store, register, userId, validatedAt,
        round2(amount / 1.2), round2(amount - amount / 1.2), amount,
        `T-TEST-${randomUUID().slice(0, 8)}`,
      ],
    );
    const saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1,$2,0,'Bouquet',$3,1,20,'TVA20',$4,$5,$3)`,
      [organizationId, saleId, amount, round2(amount / 1.2), round2(amount - amount / 1.2)],
    );
    await query(
      `INSERT INTO payments (organization_id, sale_id, method, amount, user_id)
       VALUES ($1,$2,'cash',$3,$4)`,
      [organizationId, saleId, amount, userId],
    );
    return saleId;
  }

  function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  it('annuler 2 ventes espèces DU JOUR MÊME ramène "Espèces attendues" EXACTEMENT au fond de caisse', async () => {
    const session = await CashSessionService.open({
      organizationId, storeId, registerId, userId, openingFloat: 200,
    });

    const sale1 = await insertCashSale(30, new Date().toISOString());
    const sale2 = await insertCashSale(45, new Date().toISOString());

    await SaleCancelService.cancelSale({ organizationId, userId, saleId: sale1, reason: 'Test annulation' });
    await SaleCancelService.cancelSale({ organizationId, userId, saleId: sale2, reason: 'Test annulation' });

    // Aucun mouvement de caisse ne doit avoir été créé pour ces annulations
    // du jour même (la vente annulée est déjà exclue des ventes espèces).
    const movements = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cash_movements
        WHERE cash_session_id = $1 AND reason LIKE 'Annulation vente%'`,
      [session.id],
    );
    expect(Number(movements.rows[0]!.count)).toBe(0);

    const report = await computeDayReport({
      organizationId, storeId, businessDate: today, kind: 'X', printedAt: new Date().toISOString(),
    });
    // Exactement le fond de caisse : rien n'a dû changer, les 2 ventes
    // annulées ne doivent laisser AUCUNE trace dans le calcul.
    expect(report.cash.fonds_de_caisse).toBe(200);
    expect(report.cash.total_espece_fermeture).toBe(200);

    await CashSessionService.close({ organizationId, sessionId: session.id, userId, countedCash: 200 });
  });

  it('annuler une vente espèces D\'UN AUTRE JOUR crée bien une sortie de caisse (remboursement physique aujourd\'hui)', async () => {
    const session = await CashSessionService.open({
      organizationId, storeId: storeId2, registerId: registerId2, userId, openingFloat: 200,
    });

    // Vente validée HIER (déjà dans un rapport scellé antérieur, hors de
    // portée de ce test) — on l'annule AUJOURD'HUI.
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const saleYesterday = await insertCashSale(50, yesterday, storeId2, registerId2);

    await SaleCancelService.cancelSale({ organizationId, userId, saleId: saleYesterday, reason: 'Test annulation différée' });

    const movements = await query<{ count: string; total: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount),0)::text AS total FROM cash_movements
        WHERE cash_session_id = $1 AND movement_type = 'out' AND reason LIKE 'Annulation vente%'`,
      [session.id],
    );
    expect(Number(movements.rows[0]!.count)).toBe(1);
    expect(Number(movements.rows[0]!.total)).toBe(50);

    const report = await computeDayReport({
      organizationId, storeId: storeId2, businessDate: today, kind: 'X', printedAt: new Date().toISOString(),
    });
    // Le remboursement sort bien du fond de caisse AUJOURD'HUI (rien d'autre
    // aujourd'hui) : 200 - 50 = 150.
    expect(report.cash.total_espece_fermeture).toBe(150);

    await CashSessionService.close({ organizationId, sessionId: session.id, userId, countedCash: 150 });
  });
});
