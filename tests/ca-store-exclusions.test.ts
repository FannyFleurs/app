// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mergeCaExclusionsDefaults } from '@/lib/settings/ca-exclusions';
import {
  excludeNonStoreSalesSql, hasExclusions, pushExclusionParams,
  type ResolvedCaExclusions,
} from '@/lib/analytics/store-ca-exclusions';

/**
 * CA différencié boutique / hors boutique (demande : client OGF, mode de
 * paiement Web, mode de paiement Chorus, catégorie Mariage). Le toggle « CA
 * boutique uniquement » (Tableau de bord, app CA) retire du CA toute vente
 * dont le client, un règlement ou une ligne correspond à la liste configurée
 * dans Réglages ▸ Exclusions du CA boutique.
 */
describe('mergeCaExclusionsDefaults — validation des entrées persistées', () => {
  it('liste vide par défaut', () => {
    expect(mergeCaExclusionsDefaults(null)).toEqual({ entries: [] });
    expect(mergeCaExclusionsDefaults(undefined)).toEqual({ entries: [] });
    expect(mergeCaExclusionsDefaults({})).toEqual({ entries: [] });
  });

  it('garde les entrées valides des 3 types', () => {
    const entries = [
      { type: 'customer', id: 'c1', label: 'OGF' },
      { type: 'payment_method', label: 'Web' },
      { type: 'category', id: 'cat1', label: 'Mariage' },
    ];
    expect(mergeCaExclusionsDefaults({ entries })).toEqual({ entries });
  });

  it('écarte silencieusement une entrée corrompue plutôt que de faire échouer tout le réglage', () => {
    const entries = [
      { type: 'customer', id: 'c1', label: 'OGF' },
      { type: 'customer', label: 'Sans id' }, // invalide : id manquant
      { type: 'payment_method', label: '' },  // invalide : label vide
      { type: 'unknown', id: 'x' },           // type inconnu
    ];
    expect(mergeCaExclusionsDefaults({ entries })).toEqual({
      entries: [{ type: 'customer', id: 'c1', label: 'OGF' }],
    });
  });
});

describe('excludeNonStoreSalesSql — génération du fragment SQL', () => {
  const empty: ResolvedCaExclusions = { customerIds: [], paymentLabels: [], categoryIds: [] };
  const filled: ResolvedCaExclusions = {
    customerIds: ['11111111-1111-1111-1111-111111111111'],
    paymentLabels: ['web', 'chorus'],
    categoryIds: ['22222222-2222-2222-2222-222222222222'],
  };

  it('ne touche pas à args et renvoie "" quand aucune exclusion n\'est configurée', () => {
    const args: unknown[] = ['org', '2026-01-01', '2026-01-31'];
    const sql = excludeNonStoreSalesSql(empty, args, { alias: 's' });
    expect(sql).toBe('');
    expect(args).toEqual(['org', '2026-01-01', '2026-01-31']);
  });

  it('pousse exactement 3 paramètres et référence $4/$5/$6 après 3 params existants', () => {
    const args: unknown[] = ['org', '2026-01-01', '2026-01-31'];
    const sql = excludeNonStoreSalesSql(filled, args, { alias: 's' });
    expect(args).toHaveLength(6);
    expect(args[3]).toEqual(filled.customerIds);
    expect(args[4]).toEqual(filled.paymentLabels);
    expect(args[5]).toEqual(filled.categoryIds);
    expect(sql).toContain('$4::uuid[]');
    expect(sql).toContain('$5::text[]');
    expect(sql).toContain('$6::uuid[]');
    expect(sql).toMatch(/AND NOT \(/);
  });

  it('protège la comparaison client contre le piège NULL = ANY(...) (logique 3 valeurs SQL)', () => {
    // customer_id = ANY(array) vaut NULL (pas FALSE) quand customer_id EST
    // NULL (vente sans client) — sans le IS NOT NULL, NULL se propage dans
    // le OR puis le NOT (NOT NULL = NULL), et la ligne est exclue par le
    // WHERE alors qu'elle ne correspond à AUCUN critère. Bug réel trouvé en
    // vérification navigateur : un ticket sans client disparaissait
    // entièrement du CA dès qu'UNE exclusion quelconque était configurée.
    const args: unknown[] = ['org', '2026-01-01', '2026-01-31'];
    const sql = excludeNonStoreSalesSql(filled, args, { alias: 's' });
    expect(sql).toMatch(/\(s\.customer_id IS NOT NULL AND s\.customer_id = ANY\(\$4::uuid\[\]\)\)/);
  });

  it('nullable laisse passer les lignes sans vente associée (alias.id IS NULL)', () => {
    const args: unknown[] = ['org'];
    const sql = excludeNonStoreSalesSql(filled, args, { alias: 's', nullable: true });
    expect(sql).toMatch(/AND \(s\.id IS NULL OR NOT \(/);
  });

  it('hasExclusions / pushExclusionParams restent cohérents avec un 2e tableau de params', () => {
    expect(hasExclusions(empty)).toBe(false);
    expect(hasExclusions(filled)).toBe(true);
    const argsPrev: unknown[] = ['org', '2025-01-01', '2025-01-31'];
    pushExclusionParams(filled, argsPrev);
    expect(argsPrev).toHaveLength(6);
    expect(argsPrev[3]).toEqual(filled.customerIds);
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Scénario réel : OGF (client), Web/Chorus (paiement), Mariage (catégorie)', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let ogfCustomerId: string;
  let normalCustomerId: string;
  let weddingCategoryId: string;

  beforeAll(async () => {
    const { query } = await import('@/lib/db/client');
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test CA Exclusions ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1,$2,'R1','Caisse') RETURNING id`,
      [organizationId, storeId],
    );
    registerId = register.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `ca-excl-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    await query(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE)`,
      [organizationId],
    );
    const ogf = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, company_name) VALUES ($1, 'OGF Services Financiers') RETURNING id`,
      [organizationId],
    );
    ogfCustomerId = ogf.rows[0]!.id;
    const normal = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name) VALUES ($1, 'Jean', 'Dupont') RETURNING id`,
      [organizationId],
    );
    normalCustomerId = normal.rows[0]!.id;
    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Mariage') RETURNING id`,
      [organizationId],
    );
    weddingCategoryId = cat.rows[0]!.id;

    // Configure les exclusions : client OGF, paiements Web/Chorus, catégorie Mariage.
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'ca_exclusions', $2)`,
      [organizationId, JSON.stringify({
        entries: [
          { type: 'customer', id: ogfCustomerId, label: 'OGF Services Financiers' },
          { type: 'payment_method', label: 'Web' },
          { type: 'payment_method', label: 'Chorus' },
          { type: 'category', id: weddingCategoryId, label: 'Mariage' },
        ],
      })],
    );
  });

  afterAll(async () => {
    const { pool } = await import('@/lib/db/client');
    await pool.end();
  });

  async function makeSale(opts: {
    customerId?: string | null; paymentLabel?: string; paymentMethod?: string; categoryId?: string | null;
  }): Promise<string> {
    const { query } = await import('@/lib/db/client');
    const total = 100;
    const ht = total / 1.2;
    const tva = total - ht;
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status,
         total_ht, total_tva, total_ttc, tva_breakdown, validated_at, receipt_number)
       VALUES ($1,$2,$3,$4,$5,'validated', $6, $7, $8, $9, now(), $10) RETURNING id`,
      [
        organizationId, storeId, registerId, userId, opts.customerId ?? null,
        ht, tva, total, JSON.stringify([{ rate: 20, base_ht: ht, tva, ttc: total }]),
        `R-${randomUUID().slice(0, 8)}`,
      ],
    );
    const saleId = sale.rows[0]!.id;
    await query(
      `INSERT INTO sale_lines (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
         discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc, category_id)
       VALUES ($1,$2,0,'Article',$3,1,0,20,'TVA20',$4,$5,$3,$6)`,
      [organizationId, saleId, total, ht, tva, opts.categoryId ?? null],
    );
    await query(
      `INSERT INTO payments (organization_id, sale_id, method, amount, label) VALUES ($1,$2,$3,$4,$5)`,
      [organizationId, saleId, opts.paymentMethod ?? 'card', total, opts.paymentLabel ?? null],
    );
    return saleId;
  }

  it('/api/ca/summary exclut OGF, Web, Chorus et Mariage quand exclude_non_store=1, pas sinon — et garde les ventes SANS client (walk-in)', async () => {
    const normalSaleId = await makeSale({ customerId: normalCustomerId });
    // Vente sans client (walk-in comptoir) : customer_id NULL. Reproduit le
    // bug trouvé en vérification navigateur (voir test ci-dessus sur
    // excludeNonStoreSalesSql) au niveau de la vraie base.
    const walkInSaleId = await makeSale({ customerId: null });
    await makeSale({ customerId: ogfCustomerId });
    await makeSale({ customerId: normalCustomerId, paymentMethod: 'other', paymentLabel: 'Web' });
    await makeSale({ customerId: normalCustomerId, paymentMethod: 'transfer', paymentLabel: 'Chorus' });
    await makeSale({ customerId: normalCustomerId, categoryId: weddingCategoryId });

    const { loadCaExclusions, excludeNonStoreSalesSql } = await import('@/lib/analytics/store-ca-exclusions');
    const { query } = await import('@/lib/db/client');

    const exclusions = await loadCaExclusions(organizationId);
    expect(exclusions.customerIds).toEqual([ogfCustomerId]);
    expect(exclusions.paymentLabels.sort()).toEqual(['chorus', 'web']);
    expect(exclusions.categoryIds).toEqual([weddingCategoryId]);

    // Sans filtre : les 6 ventes comptent (600€).
    const allArgs: unknown[] = [organizationId];
    const allSql = excludeNonStoreSalesSql({ customerIds: [], paymentLabels: [], categoryIds: [] }, allArgs);
    const allRes = await query<{ total: string; n: string }>(
      `SELECT COALESCE(SUM(total_ttc),0)::text AS total, COUNT(*)::text AS n
         FROM sales s WHERE s.organization_id = $1 AND s.status = 'validated' ${allSql}`,
      allArgs,
    );
    expect(Number(allRes.rows[0]!.n)).toBe(6);
    expect(Number(allRes.rows[0]!.total)).toBeCloseTo(600, 2);

    // Avec filtre : la vente "normale" ET la vente walk-in (sans client) restent (200€).
    const filteredArgs: unknown[] = [organizationId];
    const filteredSql = excludeNonStoreSalesSql(exclusions, filteredArgs, { alias: 's' });
    const filteredRes = await query<{ total: string; n: string; ids: string[] }>(
      `SELECT COALESCE(SUM(total_ttc),0)::text AS total, COUNT(*)::text AS n,
              array_agg(s.id ORDER BY s.id) AS ids
         FROM sales s WHERE s.organization_id = $1 AND s.status = 'validated' ${filteredSql}`,
      filteredArgs,
    );
    expect(Number(filteredRes.rows[0]!.n)).toBe(2);
    expect(Number(filteredRes.rows[0]!.total)).toBeCloseTo(200, 2);
    expect(filteredRes.rows[0]!.ids.sort()).toEqual([normalSaleId, walkInSaleId].sort());
  });
});
