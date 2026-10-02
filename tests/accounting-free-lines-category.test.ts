// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Attribution directe d'une famille aux « ventes saisies au prix » (lignes
 * sans produit) depuis l'écran des comptes de ventes — complète
 * link-free-lines pour les libellés qui ne seront jamais un article du
 * catalogue (ex. "Livraison", posée par les commandes entrantes web/OGF —
 * voir order-intake.ts). Intégration contre une VRAIE base Postgres (comme
 * les autres suites d'intégration *-stripe- et *-scoping).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));

const { POST: categorizeFreeLines } = await import('@/app/api/accounting/categorize-free-lines/route');
const { GET: uncategorizedProducts } = await import('@/app/api/accounting/uncategorized-products/route');

describe.skipIf(!hasDb)('Ventes saisies au prix — attribution directe d\'une famille', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;
  let categoryId: string;
  const today = new Date().toISOString().slice(0, 10);

  async function insertFreeLine(label: string, amountHt: number): Promise<void> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, validated_at, total_ttc)
       VALUES ($1, $2, $3, $4, 'validated', now(), $5) RETURNING id`,
      [organizationId, storeId, registerId, userId, amountHt * 1.2],
    );
    await query(
      `INSERT INTO sale_lines
         (organization_id, sale_id, line_index, label, unit_price_ttc, quantity,
          tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
       VALUES ($1, $2, 0, $3, $4, 1, 20, 'TVA20', $5, $5 * 0.2, $5 * 1.2)`,
      [organizationId, sale.rows[0]!.id, label, amountHt * 1.2, amountHt],
    );
  }

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Free Lines Category ${randomUUID()}`],
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
      [organizationId, `fl-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Livraison') RETURNING id`,
      [organizationId],
    );
    categoryId = cat.rows[0]!.id;

    // Deux ventes distinctes portant le même libellé "Livraison" (prix libre),
    // + une vente avec un libellé différent qui doit rester intacte.
    await insertFreeLine('Livraison', 9.08);
    await insertFreeLine('Livraison', 9.08);
    await insertFreeLine('Mystère', 10);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rejette une famille qui n\'appartient pas à l\'organisation', async () => {
    const res = await categorizeFreeLines(new Request('https://x.test', {
      method: 'POST',
      body: JSON.stringify({ label: 'Livraison', category_id: randomUUID() }),
    }));
    expect(res.status).toBe(404);
  });

  it('pose la famille sur TOUTES les ventes de ce libellé, quelle que soit la vente', async () => {
    const res = await categorizeFreeLines(new Request('https://x.test', {
      method: 'POST',
      body: JSON.stringify({ label: '  livraison  ', category_id: categoryId }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { updated: number };
    expect(body.updated).toBe(2);

    const rows = await query<{ category_id: string | null }>(
      `SELECT category_id FROM sale_lines WHERE organization_id = $1 AND lower(btrim(label)) = 'livraison'`,
      [organizationId],
    );
    expect(rows.rows.every((r) => r.category_id === categoryId)).toBe(true);
  });

  it('une ligne déjà rangée ne réapparaît plus dans « sans famille » ; une autre, non traitée, y reste', async () => {
    const url = `https://x.test/api/accounting/uncategorized-products`
      + `?from=${today}&to=${today}&vat_rate=20&store_id=${storeId}`;
    const res = await uncategorizedProducts(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json() as { freeLines: { label: string }[] };
    const labels = body.freeLines.map((f) => f.label);
    expect(labels).not.toContain('Livraison');
    expect(labels).toContain('Mystère');
  });
});
