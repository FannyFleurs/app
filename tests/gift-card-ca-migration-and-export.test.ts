// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Deux garde-fous complémentaires à tests/gift-card-ca-exclusion.test.ts :
 *
 * 1. Le rattrapage de l'historique (migration 0093) : les lignes de carte
 *    cadeau validées avant le 26 septembre 2026 n'avaient jamais le
 *    marqueur `gift_card_ca_deferred`, donc restaient comptées en CA malgré
 *    la correction du code. On rejoue ici la MÊME instruction SQL que la
 *    migration (celle-ci a déjà tourné une fois sur une base vide au
 *    `db:migrate` du bac à sable — on vérifie son comportement directement,
 *    pas son exécution par le runner).
 *
 * 2. Un bug trouvé EN CORRIGEANT ce dossier : combiner un agrégat par vente
 *    déjà existant (LATERAL) avec un JOIN direct sur sale_lines duplique cet
 *    agrégat par effet de fan-out dès qu'une vente a plusieurs lignes — et,
 *    séparément, joindre sale_lines ET payments dans la même requête
 *    duplique le CA par le nombre de règlements d'un ticket payé en
 *    plusieurs fois. Vérifié sur /api/ca/vendors (remise) et sur le calcul
 *    équivalent à l'export "Écritures comptables" (entries_csv).
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: currentUser }),
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: caVendorsGet } = await import('@/app/api/ca/vendors/route');

describe.skipIf(!hasDb)('Rattrapage historique gift_card_ca_deferred (migration 0093)', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Backfill Gift Card ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
  });

  it('ajoute le marqueur manquant sur une ligne ancienne (gift_card sans gift_card_ca_deferred)', async () => {
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, store.rows[0]!.id],
    );
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `bf-${randomUUID()}@example.test`],
    );
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         validated_at, total_ttc, total_ht, total_tva, receipt_number)
       VALUES ($1, $2, $3, $4, 'validated', '2026-08-15T10:00:00Z', 50, 50, 0, 'R-OLD-1') RETURNING id`,
      [organizationId, store.rows[0]!.id, register.rows[0]!.id, user.rows[0]!.id],
    );
    // Ligne « ancienne » : gift_card=true SEUL, comme avant le 26/09/2026.
    const line = await query<{ id: string }>(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, metadata)
       VALUES ($1, $2, 0, 'Carte cadeau', 50, 1, 0, 'CADEAU', 50, 0, 50, $3::jsonb)
       RETURNING id`,
      [organizationId, sale.rows[0]!.id, JSON.stringify({ gift_card: true })],
    );

    // Rejoue exactement l'instruction de la migration 0093.
    const sql = readFileSync(
      new URL('../migrations/0093_backfill_gift_card_ca_deferred.sql', import.meta.url),
      'utf8',
    );
    const stmt = sql.replace(/^--.*$/gm, '').trim();
    await query(stmt);

    const after = await query<{ metadata: { gift_card_ca_deferred?: boolean } }>(
      `SELECT metadata FROM sale_lines WHERE id = $1`, [line.rows[0]!.id],
    );
    expect(after.rows[0]!.metadata.gift_card_ca_deferred).toBe(true);
  });

  it('ne touche pas une ligne normale (sans gift_card)', async () => {
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF2', 'Plante Verte') RETURNING id`,
      [organizationId],
    );
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R2', 'Caisse') RETURNING id`,
      [organizationId, store.rows[0]!.id],
    );
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `bf2-${randomUUID()}@example.test`],
    );
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         validated_at, total_ttc, total_ht, total_tva, receipt_number)
       VALUES ($1, $2, $3, $4, 'validated', '2026-08-15T10:00:00Z', 30, 25, 5, 'R-OLD-2') RETURNING id`,
      [organizationId, store.rows[0]!.id, register.rows[0]!.id, user.rows[0]!.id],
    );
    const line = await query<{ id: string }>(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, 'Bouquet', 30, 1, 20, 'TVA20', 25, 5, 30)
       RETURNING id, metadata`,
      [organizationId, sale.rows[0]!.id],
    );

    const sql = readFileSync(
      new URL('../migrations/0093_backfill_gift_card_ca_deferred.sql', import.meta.url),
      'utf8',
    );
    const stmt = sql.replace(/^--.*$/gm, '').trim();
    await query(stmt);

    const after = await query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM sale_lines WHERE id = $1`, [line.rows[0]!.id],
    );
    expect(after.rows[0]!.metadata?.gift_card_ca_deferred).toBeUndefined();
  });
});

describe.skipIf(!hasDb)('Pas de double comptage (fan-out) sur une vente à plusieurs lignes / plusieurs règlements', () => {
  let organizationId: string;
  let storeId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Fanout ${randomUUID()}`],
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
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `fo-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Une vente, 3 lignes de produits (100€ TTC chacune → 300€ au total) et
    // RÉGLÉE EN 2 FOIS (cash 100€ + card 200€) : les deux cas qui peuvent
    // dupliquer un agrégat par fan-out si la requête les combine mal.
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status,
         validated_at, total_ttc, total_ht, total_tva, receipt_number)
       VALUES ($1, $2, $3, $4, 'validated', '2026-10-10T10:00:00Z', 300, 250, 50, 'R-FANOUT') RETURNING id`,
      [organizationId, storeId, register.rows[0]!.id, user.rows[0]!.id],
    );
    const saleId = sale.rows[0]!.id;
    for (let i = 0; i < 3; i++) {
      await query(
        `INSERT INTO sale_lines
           (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
            tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, discount_amount)
         VALUES ($1, $2, $3, 'Bouquet', 100, 1, 20, 'TVA20', 83.33, 16.67, 100, 10)`,
        [organizationId, saleId, i],
      );
    }
    await query(
      `INSERT INTO payments (organization_id, sale_id, method, amount) VALUES
         ($1, $2, 'cash', 100), ($1, $2, 'card', 200)`,
      [organizationId, saleId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('/api/ca/vendors : CA et remise ne sont PAS multipliés par le nombre de lignes', async () => {
    const res = await caVendorsGet(new Request(
      `https://x.test/api/ca/vendors?from=2026-10-10&to=2026-10-10&store_id=${storeId}`,
    ));
    const body = await res.json() as { vendors: { ca_ttc: number; discount: number; tickets_count: number }[] };
    expect(body.vendors).toHaveLength(1);
    expect(body.vendors[0]!.ca_ttc).toBe(300); // PAS 900 (300 × 3 lignes)
    expect(body.vendors[0]!.discount).toBe(30); // PAS 90
    expect(body.vendors[0]!.tickets_count).toBe(1);
  });

  it('agrégat journalier équivalent à l\'export "Écritures comptables" : CA non dupliqué par les 2 règlements', async () => {
    // Même requête (ht/tva excluant la carte cadeau) que entries_csv dans
    // app/api/exports/accounting/route.ts — vérifie que ne PAS joindre
    // payments dans la même requête évite la duplication par fan-out.
    const r = await query<{ ht: string; tva: string }>(
      `SELECT COALESCE(SUM(sl.line_ht), 0)::text AS ht,
              COALESCE(SUM(sl.line_tva), 0)::text AS tva
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date = '2026-10-10'`,
      [organizationId],
    );
    expect(Number(r.rows[0]!.ht)).toBeCloseTo(249.99, 2); // 3 × 83.33, PAS × 2 règlements
    expect(Number(r.rows[0]!.tva)).toBeCloseTo(50.01, 2);
  });
});
