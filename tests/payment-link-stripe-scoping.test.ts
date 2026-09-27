import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { saveStripeSettings } from '@/lib/settings/stripe-server';
import { mergeStripeDefaults } from '@/lib/settings/stripe';

const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (String(url).includes('api.stripe.com')) {
    return {
      ok: true,
      json: async () => ({ id: `cs_test_${randomUUID()}`, url: 'https://checkout.stripe.com/test' }),
    } as unknown as Response;
  }
  throw new Error(`fetch non simulé : ${url}`);
});
vi.stubGlobal('fetch', fetchMock);

/**
 * Liens de paiement (vente caisse / commande différée) — doivent utiliser le
 * compte Stripe DE LA BOUTIQUE de la vente/commande, jamais un autre : un
 * client de Plante Verte ne doit jamais atterrir sur une session Stripe (ni
 * un futur webhook) de Fanny Fleurs, et inversement. Intégration contre une
 * VRAIE base Postgres (comme les autres suites *-stripe-*.test.ts).
 */
const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
  requireSession: async () => ({ user: currentUser }),
}));
vi.mock('@/lib/audit/log', () => ({ audit: async () => undefined }));

const { POST: salePaymentLink } = await import('@/app/api/sales/[id]/payment-link/route');
const { POST: orderPaymentLink } = await import('@/app/api/orders/[id]/payment-link/route');

describe.skipIf(!hasDb)('Liens de paiement — Stripe scopé par boutique', () => {
  let organizationId: string;
  let storeFfId: string;
  let storePvId: string;
  let registerId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Payment Link ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const storeFf = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeFfId = storeFf.rows[0]!.id;
    const storePv = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [organizationId],
    );
    storePvId = storePv.rows[0]!.id;

    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R1', 'Caisse') RETURNING id`,
      [organizationId, storeFfId],
    );
    registerId = register.rows[0]!.id;

    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `pl-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    // Deux comptes Stripe distincts, un par boutique.
    await saveStripeSettings(organizationId, storeFfId, mergeStripeDefaults({
      enabled: true, secret_key: 'sk_test_ff_secret', webhook_secret: 'whsec_ff',
    }), null);
    await saveStripeSettings(organizationId, storePvId, mergeStripeDefaults({
      enabled: true, secret_key: 'sk_test_pv_secret', webhook_secret: 'whsec_pv',
    }), null);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => { fetchMock.mockClear(); });

  function authHeaderUsed(): string | undefined {
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('checkout/sessions'));
    const init = call?.[1] as RequestInit | undefined;
    return (init?.headers as Record<string, string> | undefined)?.Authorization;
  }

  it('une vente de Fanny Fleurs crée sa session Stripe avec le compte Fanny Fleurs, jamais celui de Plante Verte', async () => {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, total_ttc)
       VALUES ($1, $2, $3, $4, 'validated', 42.00) RETURNING id`,
      [organizationId, storeFfId, registerId, userId],
    );
    const res = await salePaymentLink(new Request('https://x.test'), { params: { id: sale.rows[0]!.id } });
    expect(res.status).toBe(200);
    expect(authHeaderUsed()).toBe('Bearer sk_test_ff_secret');
    expect(authHeaderUsed()).not.toBe('Bearer sk_test_pv_secret');
  });

  it('une vente de Plante Verte crée sa session Stripe avec le compte Plante Verte, jamais celui de Fanny Fleurs', async () => {
    const registerPv = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R2', 'Caisse PV') RETURNING id`,
      [organizationId, storePvId],
    );
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, total_ttc)
       VALUES ($1, $2, $3, $4, 'validated', 25.00) RETURNING id`,
      [organizationId, storePvId, registerPv.rows[0]!.id, userId],
    );
    const res = await salePaymentLink(new Request('https://x.test'), { params: { id: sale.rows[0]!.id } });
    expect(res.status).toBe(200);
    expect(authHeaderUsed()).toBe('Bearer sk_test_pv_secret');
    expect(authHeaderUsed()).not.toBe('Bearer sk_test_ff_secret');
  });

  it('la metadata de la session contient le store_id réel de la vente', async () => {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, total_ttc)
       VALUES ($1, $2, $3, $4, 'validated', 10.00) RETURNING id`,
      [organizationId, storeFfId, registerId, userId],
    );
    await salePaymentLink(new Request('https://x.test'), { params: { id: sale.rows[0]!.id } });
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('checkout/sessions'));
    const body = String((call?.[1] as RequestInit).body);
    expect(body).toContain(`metadata%5Bstore_id%5D=${storeFfId}`);
  });

  it('une commande différée de Plante Verte crée sa session Stripe avec le compte Plante Verte', async () => {
    const order = await query<{ id: string }>(
      `INSERT INTO orders (organization_id, store_id, total_amount) VALUES ($1, $2, 30.00) RETURNING id`,
      [organizationId, storePvId],
    );
    const res = await orderPaymentLink(new Request('https://x.test'), { params: { id: order.rows[0]!.id } });
    expect(res.status).toBe(200);
    expect(authHeaderUsed()).toBe('Bearer sk_test_pv_secret');
  });

  it("une boutique SANS compte Stripe propre retombe sur l'organisation, jamais sur une AUTRE boutique", async () => {
    const storeNew = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'NEW', 'Nouvelle Boutique') RETURNING id`,
      [organizationId],
    );
    await saveStripeSettings(organizationId, null, mergeStripeDefaults({
      enabled: true, secret_key: 'sk_test_org_secret', webhook_secret: 'whsec_org',
    }), null);
    const registerNew = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'R3', 'Caisse Nouvelle') RETURNING id`,
      [organizationId, storeNew.rows[0]!.id],
    );
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, status, total_ttc)
       VALUES ($1, $2, $3, $4, 'validated', 15.00) RETURNING id`,
      [organizationId, storeNew.rows[0]!.id, registerNew.rows[0]!.id, userId],
    );
    const res = await salePaymentLink(new Request('https://x.test'), { params: { id: sale.rows[0]!.id } });
    expect(res.status).toBe(200);
    expect(authHeaderUsed()).toBe('Bearer sk_test_org_secret');
    expect(authHeaderUsed()).not.toBe('Bearer sk_test_ff_secret');
    expect(authHeaderUsed()).not.toBe('Bearer sk_test_pv_secret');
  });
});
