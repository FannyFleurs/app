import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { saveStripeSettings } from '@/lib/settings/stripe-server';
import { mergeStripeDefaults } from '@/lib/settings/stripe';

/**
 * Lien de paiement caisse : le lien doit être réellement ENVOYÉ PAR EMAIL au
 * client quand sa fiche en porte une, pas seulement créé — le caissier
 * voyait auparavant « lien créé et envoyé » alors qu'aucun email ne partait
 * réellement (voir app/api/sales/[id]/payment-link/route.ts).
 *
 * Intégration contre une VRAIE base Postgres, comme payment-link-stripe-
 * scoping.test.ts.
 */
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const u = String(url);
  if (u.includes('api.stripe.com')) {
    return {
      ok: true,
      json: async () => ({ id: `cs_test_${randomUUID()}`, url: 'https://checkout.stripe.com/test' }),
    } as unknown as Response;
  }
  if (u.includes('api.brevo.com')) {
    const key = (init?.headers as Record<string, string> | undefined)?.['api-key'];
    if (key === 'bad_key') {
      return { ok: false, status: 401, text: async () => 'invalid api key' } as unknown as Response;
    }
    return { ok: true, json: async () => ({ messageId: `msg_${randomUUID()}` }) } as unknown as Response;
  }
  throw new Error(`fetch non simulé : ${url}`);
});
vi.stubGlobal('fetch', fetchMock);

const hasDb = !!process.env.DATABASE_URL;

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
  requireSession: async () => ({ user: currentUser }),
}));
vi.mock('@/lib/audit/log', () => ({ audit: async () => undefined }));

const { POST: salePaymentLink } = await import('@/app/api/sales/[id]/payment-link/route');

describe.skipIf(!hasDb)('Lien de paiement caisse — envoi réel par email', () => {
  let organizationId: string;
  let storeId: string;
  let registerId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Payment Link Email ${randomUUID()}`],
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
      [organizationId, `ple-${randomUUID()}@example.test`],
    );
    userId = user.rows[0]!.id;
    currentUser = { id: userId, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    await saveStripeSettings(organizationId, storeId, mergeStripeDefaults({
      enabled: true, secret_key: 'sk_test_secret', webhook_secret: 'whsec_test',
    }), null);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => { fetchMock.mockClear(); });

  async function makeSale(customerId: string | null): Promise<string> {
    const sale = await query<{ id: string }>(
      `INSERT INTO sales (organization_id, store_id, register_id, user_id, customer_id, status, total_ttc)
       VALUES ($1, $2, $3, $4, $5, 'validated', 42.00) RETURNING id`,
      [organizationId, storeId, registerId, userId, customerId],
    );
    return sale.rows[0]!.id;
  }

  it('envoie vraiment le lien par email quand le client en a un et que Brevo est configuré', async () => {
    await query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'email', $2::jsonb)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [organizationId, JSON.stringify({ enabled: true, api_key: 'good_key', sender_email: 'shop@example.test', sender_name: 'Fanny Fleurs' })],
    );
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name, email)
       VALUES ($1, 'Jean', 'Client', 'jean.client@example.test') RETURNING id`,
      [organizationId],
    );
    const saleId = await makeSale(customer.rows[0]!.id);

    const res = await salePaymentLink(new Request('https://x.test'), { params: { id: saleId } });
    expect(res.status).toBe(200);
    const body = await res.json() as { customer_email: string; email_delivered: boolean; email_error: string | null };
    expect(body.customer_email).toBe('jean.client@example.test');
    expect(body.email_delivered).toBe(true);
    expect(body.email_error).toBeNull();

    const brevoCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.brevo.com'));
    expect(brevoCall).toBeTruthy();
    const sent = JSON.parse(String((brevoCall![1] as RequestInit).body));
    expect(sent.to).toEqual([{ email: 'jean.client@example.test', name: 'Jean Client' }]);
    expect(sent.htmlContent).toContain('https://checkout.stripe.com/test');
  });

  it("sans email client : ne tente aucun envoi, email_delivered=false", async () => {
    const saleId = await makeSale(null);
    const res = await salePaymentLink(new Request('https://x.test'), { params: { id: saleId } });
    expect(res.status).toBe(200);
    const body = await res.json() as { customer_email: string | null; email_delivered: boolean };
    expect(body.customer_email).toBeNull();
    expect(body.email_delivered).toBe(false);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('api.brevo.com'))).toBe(false);
  });

  it('client avec email mais Brevo mal configuré : email_delivered=false avec la raison, le lien reste renvoyé', async () => {
    await query(
      `UPDATE settings SET value = $2::jsonb WHERE organization_id = $1 AND key = 'email'`,
      [organizationId, JSON.stringify({ enabled: true, api_key: 'bad_key', sender_email: 'shop@example.test' })],
    );
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (organization_id, first_name, last_name, email)
       VALUES ($1, 'Marie', 'Erreur', 'marie.erreur@example.test') RETURNING id`,
      [organizationId],
    );
    const saleId = await makeSale(customer.rows[0]!.id);

    const res = await salePaymentLink(new Request('https://x.test'), { params: { id: saleId } });
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string; email_delivered: boolean; email_error: string | null };
    expect(body.email_delivered).toBe(false);
    expect(body.email_error).toBe('PROVIDER_ERROR');
    expect(body.url).toBe('https://checkout.stripe.com/test'); // le lien reste exploitable manuellement
  });
});
