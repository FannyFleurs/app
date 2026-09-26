import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * app/api/webhooks/stripe/route.ts — chemin carte cadeau en ligne (étape 4).
 * Le service métier (lib/services/online-gift-card-fulfillment.ts) est
 * testé en profondeur dans tests/online-gift-card-fulfillment.test.ts ; ici
 * on vérifie que LA ROUTE (signature, routage par metadata) l'appelle
 * correctement, et que le traitement orders/sales existant n'est pas cassé.
 */

const WEBHOOK_SECRET = 'whsec_test_secret';
const STRIPE_CFG = {
  enabled: true, publishable_key: 'pk_test', secret_key: 'sk_test',
  webhook_secret: WEBHOOK_SECRET, return_url: '',
};

const queryMock = vi.fn(async (text: string, params: unknown[] = []) => {
  if (text.includes('FROM settings') && params[1] === 'stripe') {
    return { rows: [{ value: STRIPE_CFG }], rowCount: 1 };
  }
  if (text.includes('UPDATE sales')) {
    return { rows: [], rowCount: 1 };
  }
  if (text.includes('UPDATE orders')) {
    return { rows: [], rowCount: 1 };
  }
  throw new Error(`Requête non simulée : ${text}`);
});
vi.mock('@/lib/db/client', () => ({ query: queryMock }));

const fulfillMock = vi.fn(async () => 'issued' as const);
const expireMock = vi.fn(async () => undefined);
vi.mock('@/lib/services/online-gift-card-fulfillment', () => ({
  fulfillOnlineGiftCardCheckout: fulfillMock,
  markOnlineGiftCardOrderExpired: expireMock,
}));

const { POST } = await import('@/app/api/webhooks/stripe/route');

function sign(payload: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function post(body: unknown, signature?: string) {
  const payload = JSON.stringify(body);
  return POST(new Request('https://app.hellopos.fr/api/webhooks/stripe', {
    method: 'POST',
    headers: signature !== undefined ? { 'stripe-signature': signature } : {},
    body: payload,
  }));
}

beforeEach(() => {
  queryMock.mockClear();
  fulfillMock.mockClear();
  expireMock.mockClear();
});

describe('Webhook Stripe — signature', () => {
  it('signature valide + événement carte cadeau => 200, fulfillment appelé', async () => {
    const body = {
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test_1', payment_status: 'paid', amount_total: 5000, currency: 'eur',
        payment_intent: 'pi_test_1',
        metadata: { organization_id: 'org-a-uuid', hello_pos_type: 'online_gift_card', gift_card_order_id: 'order-1' },
      } },
    };
    const res = await post(body, sign(JSON.stringify(body)));
    expect(res.status).toBe(200);
    expect(fulfillMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a-uuid', giftCardOrderId: 'order-1', stripeSessionId: 'cs_test_1',
      paymentStatus: 'paid', amountTotalCents: 5000, currency: 'eur', paymentIntentId: 'pi_test_1',
    }));
  });

  it('signature invalide => 400, fulfillment JAMAIS appelé (aucune carte)', async () => {
    const body = {
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test_1', payment_status: 'paid', amount_total: 5000, currency: 'eur',
        metadata: { organization_id: 'org-a-uuid', hello_pos_type: 'online_gift_card', gift_card_order_id: 'order-1' },
      } },
    };
    const res = await post(body, 't=1,v1=deadbeef');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_SIGNATURE');
    expect(fulfillMock).not.toHaveBeenCalled();
  });

  it("en-tête de signature absent => 400, fulfillment JAMAIS appelé", async () => {
    const body = {
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test_1', payment_status: 'paid',
        metadata: { organization_id: 'org-a-uuid', hello_pos_type: 'online_gift_card', gift_card_order_id: 'order-1' },
      } },
    };
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(fulfillMock).not.toHaveBeenCalled();
  });
});

describe('Webhook Stripe — routage par metadata', () => {
  it("événement sans hello_pos_type reconnu (ni order_id/sale_id/gift_card_order_id) => ignoré, fulfillment jamais appelé", async () => {
    const body = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_2', payment_status: 'paid', metadata: { organization_id: 'org-a-uuid' } } },
    };
    const res = await post(body, sign(JSON.stringify(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe(true);
    expect(fulfillMock).not.toHaveBeenCalled();
  });

  it("hello_pos_type absent mais gift_card_order_id présent => IGNORÉ comme carte cadeau (tag explicite requis)", async () => {
    // Sans order_id/sale_id non plus : ignoré poliment (pas de cible reconnue).
    const body = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_3', payment_status: 'paid', metadata: { organization_id: 'org-a-uuid', gift_card_order_id: 'order-1' } } },
    };
    const res = await post(body, sign(JSON.stringify(body)));
    expect((await res.json()).ignored).toBe(true);
    expect(fulfillMock).not.toHaveBeenCalled();
  });

  it('checkout.session.expired sur une commande carte cadeau => markOnlineGiftCardOrderExpired appelé, pas fulfillment', async () => {
    const body = {
      type: 'checkout.session.expired',
      data: { object: {
        id: 'cs_test_4',
        metadata: { organization_id: 'org-a-uuid', hello_pos_type: 'online_gift_card', gift_card_order_id: 'order-1' },
      } },
    };
    const res = await post(body, sign(JSON.stringify(body)));
    expect(res.status).toBe(200);
    expect(expireMock).toHaveBeenCalledWith('org-a-uuid', 'order-1');
    expect(fulfillMock).not.toHaveBeenCalled();
  });

  it("le traitement orders/sales existant continue de fonctionner (non gift-card)", async () => {
    const body = {
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test_5', payment_status: 'paid',
        metadata: { organization_id: 'org-a-uuid', sale_id: 'sale-1' },
      } },
    };
    const res = await post(body, sign(JSON.stringify(body)));
    expect(res.status).toBe(200);
    expect(fulfillMock).not.toHaveBeenCalled();
    expect(queryMock.mock.calls.some((c) => String(c[0]).includes('UPDATE sales'))).toBe(true);
  });
});
