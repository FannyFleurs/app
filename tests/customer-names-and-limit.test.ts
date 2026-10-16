// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Deux correctifs liés à la fiche client :
 *
 * 1. Majuscule automatique sur prénom/nom, saisis en minuscule ou en
 *    majuscule ("jean dupont", "JEAN DUPONT" -> "Jean Dupont") — à la
 *    création (POST), à la modification (PATCH), et en rattrapage sur
 *    l'historique (migration 0095, rejouée ici comme pour 0093 — voir
 *    gift-card-ca-migration-and-export.test.ts). company_name n'est PAS
 *    touché (raison sociale, casse volontairement laissée telle quelle).
 *
 * 2. La liste clients du back-office était plafonnée à 200 résultats, sans
 *    aucun moyen d'en voir plus — une boutique avec plus de 200 fiches ne
 *    pouvait jamais toutes les voir, même en recherchant largement.
 *
 * Intégration contre une VRAIE base Postgres (initcap() est une fonction
 * Postgres, pas reproductible fidèlement par un mock).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET: customersGet, POST: customersPost } = await import('@/app/api/customers/route');
const { PATCH: customerPatch } = await import('@/app/api/customers/[id]/route');

describe.skipIf(!hasDb)('Fiche client — majuscule automatique et suppression du plafond de liste', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Customer Names ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `cn-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  function postBody(first: string, last: string) {
    return new Request('https://x.test', {
      method: 'POST',
      body: JSON.stringify({ type: 'particulier', first_name: first, last_name: last }),
    });
  }

  it('POST /api/customers capitalise le prénom et le nom à la création', async () => {
    const res = await customersPost(postBody('jean-pierre', 'DE LA FONTAINE'));
    expect(res.status).toBe(201);
    const { id } = await res.json() as { id: string };
    const row = await query<{ first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM customers WHERE id = $1`, [id],
    );
    expect(row.rows[0]).toMatchObject({ first_name: 'Jean-Pierre', last_name: 'De La Fontaine' });
  });

  it('PATCH /api/customers/:id capitalise le prénom et le nom à la modification', async () => {
    const created = await customersPost(postBody('x', 'y'));
    const { id } = await created.json() as { id: string };

    const res = await customerPatch(
      new Request('https://x.test', {
        method: 'PATCH',
        body: JSON.stringify({ type: 'particulier', first_name: `o'brien`, last_name: 'MARTIN' }),
      }),
      { params: { id } },
    );
    expect(res.status).toBe(200);
    const row = await query<{ first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM customers WHERE id = $1`, [id],
    );
    expect(row.rows[0]).toMatchObject({ first_name: "O'Brien", last_name: 'Martin' });
  });

  it('ne touche pas company_name (raison sociale laissée telle quelle)', async () => {
    const res = await customersPost(new Request('https://x.test', {
      method: 'POST',
      body: JSON.stringify({ type: 'professionnel', company_name: 'sarl fleurDeLys' }),
    }));
    const { id } = await res.json() as { id: string };
    const row = await query<{ company_name: string }>(
      `SELECT company_name FROM customers WHERE id = $1`, [id],
    );
    expect(row.rows[0]!.company_name).toBe('sarl fleurDeLys');
  });

  it('rattrapage historique (migration 0095) : met en forme une fiche déjà en base, toutes casses', async () => {
    const rows = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, type, first_name, last_name)
       VALUES ($1, 'particulier', 'JEAN', 'dupont'), ($1, 'particulier', 'élodie', 'O''BRIEN')
       RETURNING id`,
      [organizationId],
    );
    // Même instruction que migrations/0095_capitalize_customer_names.sql.
    await query(
      `UPDATE customers SET first_name = initcap(first_name)
        WHERE first_name IS NOT NULL AND first_name <> initcap(first_name)
          AND id = ANY($1::uuid[])`,
      [rows.rows.map((r) => r.id)],
    );
    await query(
      `UPDATE customers SET last_name = initcap(last_name)
        WHERE last_name IS NOT NULL AND last_name <> initcap(last_name)
          AND id = ANY($1::uuid[])`,
      [rows.rows.map((r) => r.id)],
    );
    const after = await query<{ first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM customers WHERE id = ANY($1::uuid[]) ORDER BY first_name`,
      [rows.rows.map((r) => r.id)],
    );
    expect(after.rows).toEqual([
      { first_name: 'Jean', last_name: 'Dupont' },
      { first_name: 'Élodie', last_name: "O'Brien" },
    ]);
  });

  it('GET /api/customers renvoie plus de 200 résultats quand plus de 200 fiches existent', async () => {
    const values: string[] = [];
    const params: unknown[] = [organizationId];
    for (let i = 0; i < 210; i++) {
      params.push(`Zz${i}`);
      values.push(`($1, 'particulier', $${params.length}, 'Plafond')`);
    }
    await query(
      `INSERT INTO customers (organization_id, type, first_name, last_name) VALUES ${values.join(',')}`,
      params,
    );

    const res = await customersGet(new Request(`https://x.test/api/customers?q=Zz&limit=100000`));
    const body = await res.json() as { customers: unknown[] };
    expect(body.customers.length).toBeGreaterThan(200);
  });
});
