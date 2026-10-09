// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Recherche clients insensible aux accents (en plus de la casse, déjà gérée) :
 * « alencon » doit retrouver « Alençon », « elise » doit retrouver « Élise »,
 * que la recherche soit accentuée ou non, quelle que soit la casse.
 * Intégration contre une VRAIE base Postgres (unaccent() est une extension
 * Postgres, pas testable par un mock).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: customersGet } = await import('@/app/api/customers/route');

describe.skipIf(!hasDb)('GET /api/customers — recherche insensible aux accents', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Customers Unaccent ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `cu-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    await query(
      `INSERT INTO customers (organization_id, type, first_name, last_name, address)
       VALUES ($1, 'particulier', 'Élise', 'Martin', '{"city":"Alençon"}'::jsonb)`,
      [organizationId],
    );
    await query(
      `INSERT INTO customers (organization_id, type, company_name)
       VALUES ($1, 'professionnel', $2)`,
      [organizationId, `Café de l'ancre`],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function search(q: string): Promise<{ display_name: string }[]> {
    const res = await customersGet(new Request(`https://x.test/api/customers?q=${encodeURIComponent(q)}`));
    const body = await res.json() as { customers: { display_name: string }[] };
    return body.customers;
  }

  it('"elise" (sans accent, minuscule) retrouve "Élise"', async () => {
    const r = await search('elise');
    expect(r.some((c) => c.display_name === 'Élise Martin')).toBe(true);
  });

  it('"ELISE" (majuscules, sans accent) retrouve aussi "Élise"', async () => {
    const r = await search('ELISE');
    expect(r.some((c) => c.display_name === 'Élise Martin')).toBe(true);
  });

  it('"cafe" (sans accent) retrouve "Café de l\'ancre"', async () => {
    const r = await search('cafe');
    expect(r.some((c) => c.display_name === `Café de l'ancre`)).toBe(true);
  });

  it('une recherche AVEC accent retrouve toujours le résultat (non-régression)', async () => {
    const r = await search('Élise');
    expect(r.some((c) => c.display_name === 'Élise Martin')).toBe(true);
  });
});
