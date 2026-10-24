// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Route /api/gift-cards/lookup, utilisée par l'écran d'encaissement pour
 * vérifier une carte cadeau avant paiement. Une carte déjà partiellement
 * utilisée passe au statut `partially_used` (voir sale-service.ts) — elle
 * doit rester utilisable tant qu'il lui reste un solde et qu'elle n'est pas
 * expirée, exactement comme un avoir (`credit_notes/lookup`, qui accepte
 * `open` ET `partially_used`).
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET } = await import('@/app/api/gift-cards/lookup/route');

describe('GET /api/gift-cards/lookup — intégration DB', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Gift Card Lookup ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `gcl-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeCard(status: string, balance: number, expiresAt: string | null = null) {
    const code = `29${randomUUID().replace(/-/g, '').slice(0, 11)}`;
    await query(
      `INSERT INTO gift_cards (organization_id, code, initial_amount, balance, status, expires_at)
       VALUES ($1, $2, 20, $3, $4, $5)`,
      [organizationId, code, balance, status, expiresAt],
    );
    return code;
  }

  function lookup(code: string) {
    return GET(new Request(`https://x.test/api/gift-cards/lookup?code=${encodeURIComponent(code)}`));
  }

  it('une carte "active" avec solde est utilisable', async () => {
    const code = await makeCard('active', 20);
    const j = await (await lookup(code)).json();
    expect(j.usable).toBe(true);
  });

  it('une carte "partially_used" avec solde restant est utilisable (régression)', async () => {
    const code = await makeCard('partially_used', 15.35);
    const res = await lookup(code);
    const j = await res.json();
    expect(j.status).toBe('partially_used');
    expect(j.remaining).toBe(15.35);
    expect(j.usable).toBe(true);
  });

  it('une carte "used" (solde à 0) n\'est pas utilisable', async () => {
    const code = await makeCard('used', 0);
    const j = await (await lookup(code)).json();
    expect(j.usable).toBe(false);
  });

  it('une carte "cancelled" n\'est pas utilisable même avec un solde', async () => {
    const code = await makeCard('cancelled', 10);
    const j = await (await lookup(code)).json();
    expect(j.usable).toBe(false);
  });

  it('une carte "partially_used" mais expirée n\'est pas utilisable', async () => {
    const code = await makeCard('partially_used', 15.35, new Date(Date.now() - 86400000).toISOString());
    const j = await (await lookup(code)).json();
    expect(j.usable).toBe(false);
  });
});
