// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { photoRefForPos } from '@/lib/products/photo-url';

/**
 * Pic de transfert réseau Neon (605 Gio en un jour) : une photo prise via
 * PDA est stockée en data URL (base64, jusqu'à ~1,5 Mo) directement dans
 * products.image_url. La caisse relit le catalogue COMPLET toutes les 15 s
 * dès qu'un seul produit change dans l'organisation (voir
 * products-catalog-version.test.ts) — embarquer ces photos dans cette liste
 * multiplie leur poids par le nombre de postes ouverts et de
 * rafraîchissements : quelques photos prises en rafale suffisent à saturer
 * le transfert réseau en une journée.
 *
 * Le correctif : la liste caisse (pos=1) référence une route dédiée mise en
 * cache (/api/products/[id]/photo), au lieu d'embarquer la donnée brute.
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));

const { GET: getProducts } = await import('@/app/api/products/route');
const { GET: getPhoto } = await import('@/app/api/products/[id]/photo/route');

describe('photoRefForPos', () => {
  it('laisse une URL normale inchangée', () => {
    expect(photoRefForPos('p1', 'https://cdn.example.test/photo.jpg', '2026-01-01')).toBe(
      'https://cdn.example.test/photo.jpg',
    );
  });
  it('laisse null inchangé', () => {
    expect(photoRefForPos('p1', null, '2026-01-01')).toBeNull();
  });
  it('remplace une data URL par une référence légère et versionnée', () => {
    expect(photoRefForPos('p1', 'data:image/jpeg;base64,/9j/4AAQ', '2026-01-01T00:00:00Z')).toBe(
      '/api/products/p1/photo?v=2026-01-01T00%3A00%3A00Z',
    );
  });
});

describe.skipIf(!hasDb)('Catalogue caisse — photo embarquée remplacée par une référence', () => {
  let organizationId: string;
  let categoryId: string;
  let taxRateId: string;
  let storeId: string;
  const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Photo Egress ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `pe-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const tax = await query<{ id: string }>(
      `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
       VALUES ($1, 'TVA20', '20%', 20, TRUE) RETURNING id`,
      [organizationId],
    );
    taxRateId = tax.rows[0]!.id;
    const cat = await query<{ id: string }>(
      `INSERT INTO product_categories (organization_id, name) VALUES ($1, 'Fleurs') RETURNING id`,
      [organizationId],
    );
    categoryId = cat.rows[0]!.id;
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'T1', 'Boutique Test') RETURNING id`,
      [organizationId],
    );
    storeId = store.rows[0]!.id;

    await query(
      `INSERT INTO products (organization_id, category_id, name, tax_rate_id, sale_price_ttc, image_url, visible_in_pos)
       VALUES ($1, $2, 'Bouquet photographié', $3, 25.00, $4, TRUE)`,
      [organizationId, categoryId, taxRateId, DATA_URL],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('pos=1 : remplace la data URL par une référence /api/products/{id}/photo', async () => {
    const res = await getProducts(new Request(`https://x.test/api/products?pos=1&store_id=${storeId}`));
    expect(res.status).toBe(200);
    const body = await res.json() as { products: { id: string; image_url: string | null }[] };
    expect(body.products).toHaveLength(1);
    const p = body.products[0]!;
    expect(p.image_url).toMatch(new RegExp(`^/api/products/${p.id}/photo\\?v=`));
    expect(p.image_url).not.toContain('base64');
  });

  it('back-office (sans pos) : garde la data URL brute — nécessaire à la duplication d\'article', async () => {
    const res = await getProducts(new Request('https://x.test/api/products'));
    expect(res.status).toBe(200);
    const body = await res.json() as { products: { image_url: string | null }[] };
    expect(body.products[0]!.image_url).toBe(DATA_URL);
  });

  it('GET /api/products/[id]/photo décode la data URL en octets avec le bon Content-Type et un cache long', async () => {
    const listRes = await getProducts(new Request('https://x.test/api/products'));
    const { products } = await listRes.json() as { products: { id: string }[] };
    const id = products[0]!.id;

    const res = await getPhoto(new Request('https://x.test'), { params: { id } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/', 'base64'))).toBe(true);
  });
});
