import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/public/gift-cards/checkout — voir docs/api-public-gift-cards.md.
 *
 * Base de données ET Stripe simulées en mémoire (comme
 * tests/public-gift-cards-config.test.ts) : vérifie le comportement RÉEL de
 * la route (statuts, corps, CORS, requêtes Stripe effectivement envoyées),
 * pas seulement des motifs dans le code source.
 */

interface FakeGiftCardConfig {
  organization_id: string; public_key: string; enabled: boolean;
  allowed_origins: string[]; preset_amounts: number[];
  allow_custom_amount: boolean; min_amount: number; max_amount: number;
}
interface FakeStripeConfig {
  enabled: boolean; publishable_key: string; secret_key: string;
  webhook_secret: string; return_url: string;
}
interface FakeOrderRow {
  id: string; organization_id: string; public_reference: string;
  amount_cents: number; currency: string;
  buyer_name: string; buyer_email: string;
  recipient_name: string; recipient_email: string | null;
  message: string | null;
  delivery_mode: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  gift_card_id: string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
  client_ip: string | null;
  created_at: string;
  updated_at: string;
  delivery_status: string;
  delivery_attempted_at: string | null;
  delivery_sent_at: string | null;
  delivery_error: string | null;
}

const orgs = [
  { id: 'org-a-uuid', name: 'Plante Verte', is_active: true },
  { id: 'org-b-uuid', name: 'Fanny Fleurs', is_active: true },
];

const giftCardConfigs: FakeGiftCardConfig[] = [
  {
    organization_id: 'org-a-uuid', public_key: 'hp_gc_AAAAAAAAAAAAAAAAAAAA', enabled: true,
    allowed_origins: ['https://plante-verte.fr'],
    preset_amounts: [25, 50], allow_custom_amount: true, min_amount: 10, max_amount: 500,
  },
  {
    // Pas de Stripe configuré pour cette organisation (voir stripeConfigs).
    organization_id: 'org-b-uuid', public_key: 'hp_gc_BBBBBBBBBBBBBBBBBBBB', enabled: true,
    allowed_origins: ['https://fanny-fleurs.com'],
    preset_amounts: [30], allow_custom_amount: false, min_amount: 20, max_amount: 200,
  },
];

const stripeConfigs: Record<string, FakeStripeConfig> = {
  'org-a-uuid': { enabled: true, publishable_key: 'pk_test_a', secret_key: 'sk_test_a', webhook_secret: 'whsec_a', return_url: '' },
  // org-b-uuid : volontairement absent -> PAYMENT_UNAVAILABLE
};

let orderRows: FakeOrderRow[] = [];
let nextOrderId = 1;

function resetFakeDb() {
  orderRows = [];
  nextOrderId = 1;
}

const queryMock = vi.fn(async (text: string, params: unknown[] = []) => {
  // Résolution clé publique -> organisation (config cartes cadeaux)
  if (text.includes("value->>'public_key'")) {
    const key = params[1] as string;
    const row = giftCardConfigs.find((c) => c.public_key === key);
    if (!row) return { rows: [], rowCount: 0 };
    const { organization_id, ...value } = row;
    return { rows: [{ organization_id, value }], rowCount: 1 };
  }
  // Organisation (nom + is_active)
  if (text.includes('FROM organizations')) {
    const id = params[0] as string;
    const org = orgs.find((o) => o.id === id && o.is_active);
    return { rows: org ? [{ name: org.name }] : [], rowCount: org ? 1 : 0 };
  }
  // Config Stripe de l'organisation
  if (text.includes('FROM settings') && params[1] === 'stripe') {
    const orgId = params[0] as string;
    const cfg = stripeConfigs[orgId];
    return { rows: cfg ? [{ value: cfg }] : [], rowCount: cfg ? 1 : 0 };
  }
  // Anti-abus : comptage par organisation
  if (text.includes('COUNT(*)') && text.includes('organization_id = $1 AND created_at')) {
    const orgId = params[0] as string;
    return { rows: [{ n: String(orderRows.filter((r) => r.organization_id === orgId).length) }], rowCount: 1 };
  }
  // Anti-abus : comptage par IP
  if (text.includes('COUNT(*)') && text.includes('client_ip = $1')) {
    const ip = params[0] as string;
    return { rows: [{ n: String(orderRows.filter((r) => r.client_ip === ip).length) }], rowCount: 1 };
  }
  // Recherche par clé d'idempotence
  if (text.includes('SELECT * FROM online_gift_card_orders') && text.includes('idempotency_key = $2')) {
    const [orgId, key] = params as [string, string];
    const row = orderRows.find((r) => r.organization_id === orgId && r.idempotency_key === key);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  // Création (INSERT ... RETURNING *)
  if (text.includes('INSERT INTO online_gift_card_orders')) {
    const [organizationId, publicReference, amountCents, buyerName, buyerEmail, recipientName, recipientEmail, message, deliveryMode, idempotencyKey, requestFingerprint, clientIp] = params as [
      string, string, number, string, string, string, string | null, string | null, string, string | null, string | null, string | null,
    ];
    if (idempotencyKey && orderRows.some((r) => r.organization_id === organizationId && r.idempotency_key === idempotencyKey)) {
      const e = new Error('duplicate key value violates unique constraint') as Error & { code?: string; constraint?: string };
      e.code = '23505';
      e.constraint = 'idx_online_gift_card_orders_org_idempotency';
      throw e;
    }
    const row: FakeOrderRow = {
      id: `order-${nextOrderId++}`,
      organization_id: organizationId,
      public_reference: publicReference,
      amount_cents: amountCents,
      currency: 'eur',
      buyer_name: buyerName, buyer_email: buyerEmail,
      recipient_name: recipientName, recipient_email: recipientEmail,
      message: message ?? null,
      delivery_mode: deliveryMode,
      status: 'pending',
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
      gift_card_id: null,
      idempotency_key: idempotencyKey ?? null,
      request_fingerprint: requestFingerprint ?? null,
      client_ip: clientIp ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      delivery_status: 'pending',
      delivery_attempted_at: null,
      delivery_sent_at: null,
      delivery_error: null,
    };
    orderRows.push(row);
    return { rows: [row], rowCount: 1 };
  }
  // Marquage session Stripe créée
  if (text.includes('SET stripe_checkout_session_id')) {
    const [orderId, sessionId] = params as [string, string];
    const row = orderRows.find((r) => r.id === orderId);
    if (row) row.stripe_checkout_session_id = sessionId;
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  // Marquage échec
  if (text.includes("SET status = 'failed'")) {
    const [orderId] = params as [string];
    const row = orderRows.find((r) => r.id === orderId && r.status === 'pending');
    if (row) row.status = 'failed';
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  // audit() : journalisation, sans incidence sur le comportement testé ici.
  if (text.includes('INSERT INTO audit_logs')) {
    return { rows: [], rowCount: 1 };
  }
  // Toute requête touchant gift_cards directement serait une régression
  // grave à cette étape (aucune carte ne doit être créée) — pas de branche
  // gérée pour cette table : elle tombe volontairement dans le throw
  // ci-dessous, qui ferait échouer le test immédiatement.
  throw new Error(`Requête non simulée dans le test (aucune carte cadeau ne doit être créée à cette étape) : ${text}`);
});

vi.mock('@/lib/db/client', () => ({ query: queryMock }));

// --- Stripe simulé : intercepte fetch(), jamais de vrai réseau. ---
let stripeShouldFail = false;
let stripeSessionCounter = 1;
const stripeSessions = new Map<string, { id: string; url: string; status: string }>();
const capturedStripeRequests: Array<{ url: string; method?: string; headers: Record<string, string>; body: URLSearchParams }> = [];

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  if (url === 'https://api.stripe.com/v1/checkout/sessions' && init?.method === 'POST') {
    const body = new URLSearchParams(String(init.body ?? ''));
    capturedStripeRequests.push({ url, method: 'POST', headers, body });
    if (stripeShouldFail) {
      return new Response(JSON.stringify({ error: { message: 'Simulated Stripe failure' } }), { status: 402 });
    }
    const id = `cs_test_${stripeSessionCounter++}`;
    const session = { id, url: `https://checkout.stripe.com/pay/${id}`, status: 'open' };
    stripeSessions.set(id, session);
    return new Response(JSON.stringify(session), { status: 200 });
  }
  if (url.startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
    capturedStripeRequests.push({ url, method: 'GET', headers, body: new URLSearchParams() });
    const id = url.split('/').pop()!;
    const session = stripeSessions.get(id);
    if (!session) return new Response(JSON.stringify({ error: { message: 'No such session' } }), { status: 404 });
    return new Response(JSON.stringify(session), { status: 200 });
  }
  throw new Error(`fetch non simulé dans le test : ${url}`);
});

vi.stubGlobal('fetch', fetchMock);

const { POST, OPTIONS } = await import('@/app/api/public/gift-cards/checkout/route');

const URL_ = 'https://app.hellopos.fr/api/public/gift-cards/checkout';
const ORG_A_KEY = 'hp_gc_AAAAAAAAAAAAAAAAAAAA';
const ORG_A_ORIGIN = 'https://plante-verte.fr';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    key: ORG_A_KEY,
    amount: 25,
    buyer: { name: 'Jean Dupont', email: 'jean@example.fr' },
    recipient: { name: 'Marie Dupont', email: 'marie@example.fr' },
    delivery_mode: 'buyer',
    message: 'Joyeux anniversaire !',
    ...overrides,
  };
}

function post(payload: unknown, origin?: string) {
  return POST(new Request(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(payload),
  }));
}

beforeEach(() => {
  resetFakeDb();
  queryMock.mockClear();
  fetchMock.mockClear();
  capturedStripeRequests.length = 0;
  stripeShouldFail = false;
  stripeSessions.clear();
  stripeSessionCounter = 1;
});

describe('Checkout — cas nominal', () => {
  it('crée une session et renvoie checkout_url + reference', async () => {
    const res = await post(validPayload(), ORG_A_ORIGIN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkout_url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(body.reference).toMatch(/^GC-[A-Z0-9]{8}$/);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORG_A_ORIGIN);
  });

  it("ne crée aucune carte cadeau (seule online_gift_card_orders est touchée)", async () => {
    await post(validPayload(), ORG_A_ORIGIN);
    expect(orderRows).toHaveLength(1);
    expect(orderRows[0]!.gift_card_id).toBeNull();
    expect(orderRows[0]!.status).toBe('pending');
    // Aucune requête n'a jamais visé la table gift_cards (le mock aurait
    // levé une erreur "Requête non simulée" sinon).
  });

  it('crée la tentative interne en pending AVANT Stripe, puis y associe la session', async () => {
    await post(validPayload(), ORG_A_ORIGIN);
    expect(orderRows[0]!.stripe_checkout_session_id).toMatch(/^cs_test_/);
  });
});

describe('Checkout — contenu envoyé à Stripe', () => {
  it('mode=payment, currency=eur, quantity=1, montant en centimes entiers', async () => {
    await post(validPayload({ amount: 25 }), ORG_A_ORIGIN);
    const [req] = capturedStripeRequests;
    expect(req!.body.get('mode')).toBe('payment');
    expect(req!.body.get('line_items[0][price_data][currency]')).toBe('eur');
    expect(req!.body.get('line_items[0][price_data][unit_amount]')).toBe('2500');
    expect(req!.body.get('line_items[0][quantity]')).toBe('1');
  });

  it('libellé "Carte cadeau — {organisation}"', async () => {
    await post(validPayload(), ORG_A_ORIGIN);
    const [req] = capturedStripeRequests;
    expect(req!.body.get('line_items[0][price_data][product_data][name]')).toBe('Carte cadeau — Plante Verte');
  });

  it("utilise l'email de l'ACHETEUR comme customer_email, jamais celui du bénéficiaire", async () => {
    await post(validPayload({
      buyer: { name: 'Jean Dupont', email: 'acheteur@example.fr' },
      recipient: { name: 'Marie Dupont', email: 'beneficiaire@example.fr' },
    }), ORG_A_ORIGIN);
    const [req] = capturedStripeRequests;
    expect(req!.body.get('customer_email')).toBe('acheteur@example.fr');
  });

  it('metadata serveur correctes (hello_pos_type, gift_card_order_id, organization_id)', async () => {
    await post(validPayload(), ORG_A_ORIGIN);
    const [req] = capturedStripeRequests;
    expect(req!.body.get('metadata[hello_pos_type]')).toBe('online_gift_card');
    expect(req!.body.get('metadata[gift_card_order_id]')).toBe(orderRows[0]!.id);
    expect(req!.body.get('metadata[organization_id]')).toBe('org-a-uuid');
  });

  it("utilise le Stripe secret de l'organisation résolue, jamais un autre", async () => {
    await post(validPayload(), ORG_A_ORIGIN);
    const [req] = capturedStripeRequests;
    expect(req!.headers.Authorization).toBe('Bearer sk_test_a');
  });

  it('accepte quand acheteur et bénéficiaire sont la même personne', async () => {
    const res = await post(validPayload({
      buyer: { name: 'Jean Dupont', email: 'jean@example.fr' },
      recipient: { name: 'Jean Dupont', email: 'jean@example.fr' },
    }), ORG_A_ORIGIN);
    expect(res.status).toBe(200);
  });
});

describe('Multi-tenant', () => {
  it("n'expose jamais organization_id, ni les clés Stripe, dans la réponse", async () => {
    const res = await post(validPayload(), ORG_A_ORIGIN);
    const raw = await res.text();
    expect(raw).not.toContain('org-a-uuid');
    expect(raw).not.toContain('sk_test_a');
    expect(raw.toLowerCase()).not.toContain('secret_key');
  });

  it("refuse un organization_id fourni par le payload (schéma strict)", async () => {
    const res = await post({ ...validPayload(), organization_id: 'org-b-uuid' }, ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });

  it('refuse price_id / product_id / metadata arbitraires fournis par le payload', async () => {
    const res1 = await post({ ...validPayload(), price_id: 'price_evil' }, ORG_A_ORIGIN);
    expect(res1.status).toBe(422);
    const res2 = await post({ ...validPayload(), metadata: { hack: true } }, ORG_A_ORIGIN);
    expect(res2.status).toBe(422);
  });
});

describe('Montants', () => {
  it('preset valide => 200', async () => {
    const res = await post(validPayload({ amount: 25 }), ORG_A_ORIGIN);
    expect(res.status).toBe(200);
  });

  it('montant libre valide (entre min et max) => 200', async () => {
    const res = await post(validPayload({ amount: 42 }), ORG_A_ORIGIN);
    expect(res.status).toBe(200);
  });

  it('montant libre interdit pour une organisation qui ne l\'autorise pas => 422', async () => {
    const res = await post({
      key: 'hp_gc_BBBBBBBBBBBBBBBBBBBB', amount: 99,
      buyer: { name: 'A', email: 'a@example.fr' }, recipient: { name: 'B', email: 'b@example.fr' }, delivery_mode: 'buyer',
    }, 'https://fanny-fleurs.com');
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error).toBe('INVALID_AMOUNT');
  });

  it('montant inférieur au minimum => 422', async () => {
    const res = await post(validPayload({ amount: 5 }), ORG_A_ORIGIN);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('INVALID_AMOUNT');
  });

  it('montant supérieur au maximum => 422', async () => {
    const res = await post(validPayload({ amount: 600 }), ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });

  it('gère correctement les décimales (25,50 €)', async () => {
    const res = await post(validPayload({ amount: 25.5 }), ORG_A_ORIGIN);
    expect(res.status).toBe(200);
    const [req] = capturedStripeRequests;
    expect(req!.body.get('line_items[0][price_data][unit_amount]')).toBe('2550');
  });

  it('valeur non numérique => 422', async () => {
    const res = await post({ ...validPayload(), amount: 'cinquante' }, ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });
});

describe('Données client', () => {
  it('email acheteur invalide => 422', async () => {
    const res = await post(validPayload({ buyer: { name: 'Jean', email: 'pas-un-email' } }), ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });

  it('champ recipient manquant => 422', async () => {
    const payload = validPayload() as Record<string, unknown>;
    delete payload.recipient;
    const res = await post(payload, ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });

  it('message trop long (> 500) => 422', async () => {
    const res = await post(validPayload({ message: 'x'.repeat(501) }), ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });

  it('refuse un tableau ou objet à la place d\'une chaîne', async () => {
    const res = await post({ ...validPayload(), buyer: { name: ['Jean'], email: 'jean@example.fr' } }, ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });
});

describe('delivery_mode', () => {
  it("delivery_mode='buyer' : recipient.email facultatif => 200, commande créée avec delivery_mode persisté", async () => {
    const res = await post({
      ...validPayload(),
      recipient: { name: 'Marie Dupont' }, // pas d'email : carte imprimable/remise en main propre
      delivery_mode: 'buyer',
    }, ORG_A_ORIGIN);
    expect(res.status).toBe(200);
    expect(orderRows[0]!.recipient_email).toBeNull();
    expect(orderRows[0]!.delivery_mode).toBe('buyer');
  });

  it("delivery_mode='recipient' avec recipient.email => 200", async () => {
    const res = await post(validPayload({ delivery_mode: 'recipient' }), ORG_A_ORIGIN);
    expect(res.status).toBe(200);
    expect(orderRows[0]!.delivery_mode).toBe('recipient');
    expect(orderRows[0]!.recipient_email).toBe('marie@example.fr');
  });

  it("delivery_mode='recipient' SANS recipient.email => 422, requête rejetée proprement", async () => {
    const res = await post({
      ...validPayload(),
      recipient: { name: 'Marie Dupont' },
      delivery_mode: 'recipient',
    }, ORG_A_ORIGIN);
    expect(res.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('buyer.email reste obligatoire dans tous les cas (y compris delivery_mode=buyer)', async () => {
    const payload = validPayload({ delivery_mode: 'buyer' }) as Record<string, unknown>;
    const buyer = payload.buyer as Record<string, unknown>;
    delete buyer.email;
    const res = await post(payload, ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });

  it('delivery_mode manquant => 422 (champ obligatoire)', async () => {
    const payload = validPayload() as Record<string, unknown>;
    delete payload.delivery_mode;
    const res = await post(payload, ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });

  it('delivery_mode invalide (valeur arbitraire) => 422', async () => {
    const res = await post(validPayload({ delivery_mode: 'scheduled' }), ORG_A_ORIGIN);
    expect(res.status).toBe(422);
  });
});

describe('Origin', () => {
  it('origine autorisée => 200 + en-tête CORS exact', async () => {
    const res = await post(validPayload(), ORG_A_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORG_A_ORIGIN);
  });

  it('origine non autorisée => 403, aucun en-tête CORS', async () => {
    const res = await post(validPayload(), 'https://un-site-quelconque.test');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('ORIGIN_NOT_ALLOWED');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('origine absente => 403 (Origin obligatoire pour ce POST, contrairement au GET config)', async () => {
    const res = await post(validPayload());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('tentative de success_url externe => 422, aucune session Stripe créée', async () => {
    const res = await post(validPayload({ success_path: 'https://site-malicious.com/vole' }), ORG_A_ORIGIN);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('INVALID_RETURN_PATH');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tentative //evil.com (protocole-relatif) => 422', async () => {
    const res = await post(validPayload({ cancel_path: '//evil.com' }), ORG_A_ORIGIN);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('INVALID_RETURN_PATH');
  });

  it('OPTIONS renvoie les méthodes autorisées', async () => {
    const res = await OPTIONS(new Request(URL_, { method: 'OPTIONS', headers: { origin: ORG_A_ORIGIN } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
  });
});

describe('Erreurs', () => {
  it("Stripe non configuré pour l'organisation => 503 PAYMENT_UNAVAILABLE, aucun appel Stripe", async () => {
    const res = await post({
      key: 'hp_gc_BBBBBBBBBBBBBBBBBBBB', amount: 30,
      buyer: { name: 'A', email: 'a@example.fr' }, recipient: { name: 'B', email: 'b@example.fr' }, delivery_mode: 'buyer',
    }, 'https://fanny-fleurs.com');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('PAYMENT_UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Stripe échoue => 502 CHECKOUT_UNAVAILABLE, la tentative interne passe en failed, message Stripe non exposé', async () => {
    stripeShouldFail = true;
    const res = await post(validPayload(), ORG_A_ORIGIN);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('CHECKOUT_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('Simulated Stripe failure');
    expect(orderRows[0]!.status).toBe('failed');
  });

  it('intégration désactivée => 404 GIFT_CARDS_NOT_AVAILABLE (même réponse que clé invalide)', async () => {
    // Réutilise la config B mais désactivée le temps du test.
    giftCardConfigs[1]!.enabled = false;
    try {
      const res = await post({
        key: 'hp_gc_BBBBBBBBBBBBBBBBBBBB', amount: 30,
        buyer: { name: 'A', email: 'a@example.fr' }, recipient: { name: 'B', email: 'b@example.fr' }, delivery_mode: 'buyer',
      }, 'https://fanny-fleurs.com');
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('GIFT_CARDS_NOT_AVAILABLE');
    } finally {
      giftCardConfigs[1]!.enabled = true;
    }
  });

  it('clé invalide/inconnue => 404 GIFT_CARDS_NOT_AVAILABLE', async () => {
    const res = await post(validPayload({ key: 'hp_gc_ZZZZZZZZZZZZZZZZZZZZ' }), ORG_A_ORIGIN);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('GIFT_CARDS_NOT_AVAILABLE');
  });
});

describe('Idempotence', () => {
  it('même clé + même contenu rejoué => même session, un seul appel Stripe', async () => {
    const payload = validPayload({ idempotency_key: 'client-attempt-0001' });
    const res1 = await post(payload, ORG_A_ORIGIN);
    const res2 = await post(payload, ORG_A_ORIGIN);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body2.reference).toBe(body1.reference);
    expect(body2.checkout_url).toBe(body1.checkout_url);
    expect(orderRows).toHaveLength(1);
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1);
  });

  it('même clé + payload DIFFÉRENT => 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
    await post(validPayload({ idempotency_key: 'client-attempt-0002', amount: 25 }), ORG_A_ORIGIN);
    const res = await post(validPayload({ idempotency_key: 'client-attempt-0002', amount: 50 }), ORG_A_ORIGIN);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });
});

describe('Anti-abus (rate limiting)', () => {
  it('refuse au-delà de la limite par IP', async () => {
    // Pré-remplit 5 tentatives récentes pour la même IP (limite atteinte).
    for (let i = 0; i < 5; i++) {
      orderRows.push({
        id: `seed-${i}`, organization_id: 'org-a-uuid', public_reference: `GC-SEED${i}`,
        amount_cents: 2500, currency: 'eur', buyer_name: 'X', buyer_email: 'x@example.fr',
        recipient_name: 'Y', recipient_email: 'y@example.fr', message: null, delivery_mode: 'buyer', status: 'pending',
        stripe_checkout_session_id: null, stripe_payment_intent_id: null, gift_card_id: null,
        idempotency_key: null, request_fingerprint: null, client_ip: '203.0.113.1',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        delivery_status: 'pending', delivery_attempted_at: null, delivery_sent_at: null, delivery_error: null,
      });
    }
    const res = await POST(new Request(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: ORG_A_ORIGIN, 'x-forwarded-for': '203.0.113.1' },
      body: JSON.stringify(validPayload()),
    }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('RATE_LIMITED');
  });
});
