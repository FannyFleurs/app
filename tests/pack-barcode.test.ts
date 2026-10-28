// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { isValidEan13 } from '@/lib/services/ean';
import { buildCodeIndex } from '@/app/pda/scan';

/**
 * Un pack n'avait aucun code-barres à la création : impossible de le scanner
 * en caisse (il n'apparaissait dans aucun index de codes) ou de lui imprimer
 * une étiquette (champ vide). Chaque pack reçoit désormais un EAN-13 interne
 * (préfixe 28) à la création, comme les cartes cadeaux en reçoivent un
 * (préfixe 29) — même mécanisme, même garantie d'unicité par organisation.
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: packsPost } = await import('@/app/api/products/packs/route');

describe.skipIf(!hasDb)('Pack — code-barres interne', () => {
  let organizationId: string;
  let componentId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Pack Barcode ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `pb-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
    const tva = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE) RETURNING id`,
      [organizationId],
    );
    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Bouquets') RETURNING id`,
      [organizationId],
    );
    const comp = await query<{ id: string }>(
      `INSERT INTO products (organization_id, category_id, name, tax_rate_id, sale_price_ttc)
       VALUES ($1, $2, 'Rose', $3, 5) RETURNING id`,
      [organizationId, cat.rows[0]!.id, tva.rows[0]!.id],
    );
    componentId = comp.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function post(body: unknown) {
    return packsPost(new Request('https://x.test/api/products/packs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  }

  it('un pack créé reçoit un EAN-13 valide, préfixe interne 28', async () => {
    const res = await post({ name: 'Pack Saint-Valentin', items: [{ product_id: componentId, quantity: 1 }] });
    expect(res.status).toBe(200);
    const { id } = await res.json() as { id: string };

    const row = await query<{ barcode: string | null }>(`SELECT barcode FROM products WHERE id = $1`, [id]);
    const barcode = row.rows[0]!.barcode;
    expect(barcode).toMatch(/^28\d{11}$/);
    expect(isValidEan13(barcode!)).toBe(true);
  });

  it('deux packs de la même organisation reçoivent des codes distincts', async () => {
    const res1 = await post({ name: 'Pack A', items: [{ product_id: componentId, quantity: 1 }] });
    const res2 = await post({ name: 'Pack B', items: [{ product_id: componentId, quantity: 1 }] });
    const { id: id1 } = await res1.json() as { id: string };
    const { id: id2 } = await res2.json() as { id: string };

    const rows = await query<{ barcode: string }>(
      `SELECT barcode FROM products WHERE id = ANY($1::uuid[])`, [[id1, id2]],
    );
    const codes = rows.rows.map((r) => r.barcode);
    expect(new Set(codes).size).toBe(2);
  });

  it('le code du pack le rend résolvable par l\'index de scan de la caisse', async () => {
    const res = await post({ name: 'Pack Fête des mères', items: [{ product_id: componentId, quantity: 1 }] });
    const { id } = await res.json() as { id: string };
    const row = await query<{ barcode: string }>(`SELECT barcode FROM products WHERE id = $1`, [id]);
    const barcode = row.rows[0]!.barcode;

    const index = buildCodeIndex([{ id, barcode, sku: null, is_pack: true }]);
    expect(index.get(barcode.toLowerCase())).toMatchObject({ id });
  });
});
