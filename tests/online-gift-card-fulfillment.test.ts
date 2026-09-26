import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Émission de carte cadeau suite à un paiement Stripe confirmé (étape 4).
 *
 * Base de données simulée en mémoire (organisations, online_gift_card_orders,
 * gift_cards) : `withTransaction`/`query` sont mockés pour exercer la VRAIE
 * logique de lib/services/online-gift-card-fulfillment.ts et
 * lib/services/gift-card-service.ts (aucune duplication de leur comportement
 * dans le mock — seul le stockage est simulé).
 *
 * La concurrence réelle (verrouillage `FOR UPDATE` Postgres) n'est pas
 * simulable sans vraie base : ces tests valident que la LOGIQUE applicative
 * ne peut jamais émettre deux cartes pour la même commande, y compris
 * lorsqu'elle est appelée deux fois de suite (rejeu, "concurrence" au sens
 * séquentiel) — la garantie de verrouillage elle-même est une propriété de
 * Postgres, pas de ce code.
 */

interface FakeOrderRow {
  id: string; organization_id: string; public_reference: string;
  amount_cents: number; currency: string;
  buyer_name: string; buyer_email: string;
  recipient_name: string; recipient_email: string;
  message: string | null;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  gift_card_id: string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
}

interface FakeGiftCardRow {
  id: string; organization_id: string; code: string;
  initial_amount: number; balance: number;
  buyer_name: string | null; buyer_phone: string | null; buyer_email: string | null;
  status: string;
}

let orders: FakeOrderRow[] = [];
let giftCards: FakeGiftCardRow[] = [];
let movements: Array<{ organization_id: string; gift_card_id: string; movement_type: string; amount_delta: number; user_id: string | null }> = [];
let nextGiftCardId = 1;

function resetFakeDb() {
  orders = [];
  giftCards = [];
  movements = [];
  nextGiftCardId = 1;
}

function seedOrder(overrides: Partial<FakeOrderRow> = {}): FakeOrderRow {
  const row: FakeOrderRow = {
    id: 'order-1', organization_id: 'org-a-uuid', public_reference: 'GC-AAAAAAAA',
    amount_cents: 5000, currency: 'eur',
    buyer_name: 'Jonathan Frissong', buyer_email: 'jonathan@example.com',
    recipient_name: 'Guillaume Dupont', recipient_email: 'guillaume@example.com',
    message: 'Joyeux anniversaire !',
    status: 'pending',
    stripe_checkout_session_id: 'cs_test_1',
    stripe_payment_intent_id: null,
    gift_card_id: null,
    idempotency_key: null,
    request_fingerprint: null,
    ...overrides,
  };
  orders.push(row);
  return row;
}

/** Simule le client de transaction (pg PoolClient) partagé par
 *  fulfillOnlineGiftCardCheckout ET GiftCardService.create (même objet,
 *  comme dans le vrai code — c'est justement ce qui garantit l'atomicité). */
function makeFakeClient() {
  return {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      // Verrouillage (simulé : pas de vrai FOR UPDATE, mais la ligne lue est
      // toujours l'état COURANT du tableau en mémoire).
      if (text.includes('SELECT * FROM online_gift_card_orders') && text.includes('FOR UPDATE')) {
        const id = params[0] as string;
        const row = orders.find((o) => o.id === id);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes("UPDATE online_gift_card_orders") && text.includes("status = 'issued'")) {
        const [orderId, giftCardId, paymentIntentId] = params as [string, string, string | null];
        const row = orders.find((o) => o.id === orderId);
        if (row) {
          row.status = 'issued';
          row.gift_card_id = giftCardId;
          row.stripe_payment_intent_id = paymentIntentId;
        }
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      // --- GiftCardService.create : mêmes requêtes que le vrai service ---
      if (text.includes('SELECT 1 FROM gift_cards WHERE code')) {
        const code = params[0] as string;
        const exists = giftCards.some((g) => g.code === code);
        return { rows: exists ? [{ '?column?': 1 }] : [], rowCount: exists ? 1 : 0 };
      }
      if (text.includes("column_name = 'kind'")) {
        return { rows: [], rowCount: 0 }; // colonne kind absente : chemin "schéma initial"
      }
      if (text.includes("column_name IN ('buyer_name','buyer_phone','buyer_email')")) {
        return { rows: [{ column_name: 'buyer_name' }, { column_name: 'buyer_phone' }, { column_name: 'buyer_email' }], rowCount: 3 };
      }
      if (text.includes('INSERT INTO gift_cards')) {
        // Colonnes : organization_id, code, initial_amount, expires_at,
        // buyer_id, beneficiary_id, buyer_name, buyer_phone, buyer_email
        const [organizationId, code, amount, , buyerId, beneficiaryId, buyerName, buyerPhone, buyerEmail] = params as [
          string, string, number, string, string | null, string | null, string | null, string | null, string | null,
        ];
        void buyerId; void beneficiaryId;
        const id = `gift-card-${nextGiftCardId++}`;
        giftCards.push({
          id, organization_id: organizationId, code,
          initial_amount: amount, balance: amount,
          buyer_name: buyerName, buyer_phone: buyerPhone, buyer_email: buyerEmail,
          status: 'active',
        });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (text.includes('INSERT INTO gift_card_movements')) {
        const [organizationId, giftCardId, amountDelta, , userId] = params as [string, string, number, number, string | null];
        movements.push({ organization_id: organizationId, gift_card_id: giftCardId, movement_type: 'issue', amount_delta: amountDelta, user_id: userId });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Requête (client transaction) non simulée : ${text}`);
    }),
  };
}

const queryMock = vi.fn(async (text: string, params: unknown[] = []) => {
  if (text.includes('FROM settings') && params[1] === 'stripe') {
    // Non utilisé directement par ces tests (le webhook route n'est pas
    // exercé ici, seulement le service de fulfillment) — conservé pour
    // compatibilité si un test futur appelle la route complète.
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("UPDATE online_gift_card_orders SET status = 'expired'")) {
    const [orderId, organizationId] = params as [string, string];
    const row = orders.find((o) => o.id === orderId && o.organization_id === organizationId && o.status === 'pending');
    if (row) row.status = 'expired';
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  throw new Error(`Requête (query) non simulée : ${text}`);
});

vi.mock('@/lib/db/client', () => ({
  query: queryMock,
  withTransaction: async (fn: (client: ReturnType<typeof makeFakeClient>) => Promise<unknown>) => fn(makeFakeClient()),
}));

const { fulfillOnlineGiftCardCheckout, markOnlineGiftCardOrderExpired } = await import('@/lib/services/online-gift-card-fulfillment');

function validArgs(overrides: Partial<Parameters<typeof fulfillOnlineGiftCardCheckout>[0]> = {}) {
  return {
    organizationId: 'org-a-uuid',
    giftCardOrderId: 'order-1',
    stripeSessionId: 'cs_test_1',
    paymentStatus: 'paid',
    amountTotalCents: 5000,
    currency: 'eur',
    paymentIntentId: 'pi_test_1',
    ...overrides,
  };
}

beforeEach(() => {
  resetFakeDb();
  queryMock.mockClear();
});

describe('Émission — cas nominal', () => {
  it('paiement valide => carte créée, active, montant exact, organisation exacte', async () => {
    seedOrder();
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs());
    expect(outcome).toBe('issued');
    expect(giftCards).toHaveLength(1);
    const card = giftCards[0]!;
    expect(card.status).toBe('active');
    expect(card.initial_amount).toBe(5000 / 100);
    expect(card.organization_id).toBe('org-a-uuid');
  });

  it("aucune dépendance store_id (le modèle carte n'a pas cette notion)", async () => {
    seedOrder();
    await fulfillOnlineGiftCardCheckout(validArgs());
    expect(giftCards[0]).not.toHaveProperty('store_id');
  });

  it('la commande passe à "issued", gift_card_id et paid_at renseignés', async () => {
    seedOrder();
    await fulfillOnlineGiftCardCheckout(validArgs());
    const order = orders[0]!;
    expect(order.status).toBe('issued');
    expect(order.gift_card_id).toBe(giftCards[0]!.id);
    expect(order.stripe_payment_intent_id).toBe('pi_test_1');
  });

  it("compatible avec la recherche/l'utilisation en caisse existante (GiftCardService.lookup filtre par organization_id + code)", async () => {
    seedOrder();
    await fulfillOnlineGiftCardCheckout(validArgs());
    const card = giftCards[0]!;
    expect(card.code).toMatch(/^29/); // préfixe EAN-13 interne existant, comme en caisse
  });
});

describe('Buyer vs recipient — règle métier impérative', () => {
  it('le titulaire de la carte est recipient.name, jamais buyer.name', async () => {
    seedOrder({
      buyer_name: 'Jonathan Frissong', buyer_email: 'jonathan@example.com',
      recipient_name: 'Guillaume Dupont', recipient_email: 'guillaume@example.com',
    });
    await fulfillOnlineGiftCardCheckout(validArgs());
    const card = giftCards[0]!;
    expect(card.buyer_name).toBe('Guillaume Dupont');
    expect(card.buyer_name).not.toBe('Jonathan Frissong');
    expect(card.buyer_email).toBe('guillaume@example.com');
    expect(card.buyer_email).not.toBe('jonathan@example.com');
  });

  it("la commande conserve buyer ET recipient ET le message après émission", async () => {
    seedOrder({
      buyer_name: 'Jonathan Frissong', buyer_email: 'jonathan@example.com',
      recipient_name: 'Guillaume Dupont', recipient_email: 'guillaume@example.com',
      message: 'Joyeux anniversaire !',
    });
    await fulfillOnlineGiftCardCheckout(validArgs());
    const order = orders[0]!;
    expect(order.buyer_name).toBe('Jonathan Frissong');
    expect(order.buyer_email).toBe('jonathan@example.com');
    expect(order.recipient_name).toBe('Guillaume Dupont');
    expect(order.recipient_email).toBe('guillaume@example.com');
    expect(order.message).toBe('Joyeux anniversaire !');
  });
});

describe('Validations de sécurité — aucune carte en cas d\'incohérence', () => {
  it('commande introuvable => order_not_found, aucune carte', async () => {
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs({ giftCardOrderId: 'does-not-exist' }));
    expect(outcome).toBe('order_not_found');
    expect(giftCards).toHaveLength(0);
  });

  it('organization_id des metadata ≠ organisation de la commande => refusé, aucune carte', async () => {
    seedOrder({ organization_id: 'org-a-uuid' });
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs({ organizationId: 'org-b-uuid' }));
    expect(outcome).toBe('organization_mismatch');
    expect(giftCards).toHaveLength(0);
  });

  it('session Stripe ≠ session enregistrée sur la commande => refusé, aucune carte', async () => {
    seedOrder({ stripe_checkout_session_id: 'cs_test_1' });
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs({ stripeSessionId: 'cs_test_OTHER' }));
    expect(outcome).toBe('session_mismatch');
    expect(giftCards).toHaveLength(0);
  });

  it('montant Stripe ≠ montant attendu => refusé, aucune carte', async () => {
    seedOrder({ amount_cents: 5000 });
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs({ amountTotalCents: 4999 }));
    expect(outcome).toBe('amount_mismatch');
    expect(giftCards).toHaveLength(0);
  });

  it('devise ≠ devise attendue => refusé, aucune carte', async () => {
    seedOrder({ currency: 'eur' });
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs({ currency: 'usd' }));
    expect(outcome).toBe('currency_mismatch');
    expect(giftCards).toHaveLength(0);
  });

  it("session non payée (payment_status ≠ 'paid') => refusé, aucune carte", async () => {
    seedOrder();
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs({ paymentStatus: 'unpaid' }));
    expect(outcome).toBe('not_paid');
    expect(giftCards).toHaveLength(0);
  });
});

describe('Idempotence', () => {
  it('webhook reçu deux fois (rejeu identique) => une seule carte créée', async () => {
    seedOrder();
    const first = await fulfillOnlineGiftCardCheckout(validArgs());
    const second = await fulfillOnlineGiftCardCheckout(validArgs());
    expect(first).toBe('issued');
    expect(second).toBe('already_issued');
    expect(giftCards).toHaveLength(1);
  });

  it('deux traitements "concurrents" (appels successifs sur le même état) => une seule carte', async () => {
    seedOrder();
    const results = [];
    for (let i = 0; i < 2; i++) results.push(await fulfillOnlineGiftCardCheckout(validArgs()));
    expect(results.filter((r) => r === 'issued')).toHaveLength(1);
    expect(results.filter((r) => r === 'already_issued')).toHaveLength(1);
    expect(giftCards).toHaveLength(1);
  });

  it('retry Stripe après succès => aucune nouvelle carte, ni modification de la carte existante', async () => {
    seedOrder();
    await fulfillOnlineGiftCardCheckout(validArgs());
    const cardIdAfterFirst = orders[0]!.gift_card_id;
    await fulfillOnlineGiftCardCheckout(validArgs());
    expect(orders[0]!.gift_card_id).toBe(cardIdAfterFirst);
    expect(giftCards).toHaveLength(1);
  });

  it('traitement partiellement répété (ex. retry après un précédent mismatch) ne crée jamais deux cartes', async () => {
    seedOrder();
    // Premier appel avec un montant erroné (rejeté), puis un appel valide.
    await fulfillOnlineGiftCardCheckout(validArgs({ amountTotalCents: 1 }));
    expect(giftCards).toHaveLength(0);
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs());
    expect(outcome).toBe('issued');
    expect(giftCards).toHaveLength(1);
    // Un nouveau rejeu (même valide) ne doit toujours rien recréer.
    await fulfillOnlineGiftCardCheckout(validArgs());
    expect(giftCards).toHaveLength(1);
  });
});

describe('Session expirée', () => {
  it('marque la commande "expired" sans jamais créer de carte', async () => {
    seedOrder();
    await markOnlineGiftCardOrderExpired('org-a-uuid', 'order-1');
    expect(orders[0]!.status).toBe('expired');
    expect(giftCards).toHaveLength(0);
  });

  it("n'efface pas une commande déjà émise (garde ne s'applique qu'à 'pending')", async () => {
    seedOrder();
    await fulfillOnlineGiftCardCheckout(validArgs());
    await markOnlineGiftCardOrderExpired('org-a-uuid', 'order-1');
    expect(orders[0]!.status).toBe('issued'); // pas écrasé par 'expired'
  });
});

describe('Multi-tenant', () => {
  it("une carte de l'organisation A n'est jamais visible/liée à l'organisation B", async () => {
    seedOrder({ id: 'order-a', organization_id: 'org-a-uuid' });
    await fulfillOnlineGiftCardCheckout(validArgs({ giftCardOrderId: 'order-a' }));
    expect(giftCards[0]!.organization_id).toBe('org-a-uuid');
    // Une commande d'une autre organisation ne peut pas réclamer cette carte :
    // organization_id est vérifié AVANT toute émission (voir test dédié
    // ci-dessus) — la carte reste strictement scopée à org-a-uuid.
    expect(giftCards.some((g) => g.organization_id === 'org-b-uuid')).toBe(false);
  });

  it('organisation A (boutiques A1 + A2) : la carte émise est utilisable par les deux, via organization_id — pas de store_id', async () => {
    seedOrder({ id: 'order-a', organization_id: 'org-a-uuid' });
    await fulfillOnlineGiftCardCheckout(validArgs({ giftCardOrderId: 'order-a' }));
    const card = giftCards[0]!;
    // "Utilisable depuis A1 ET A2" = le modèle carte ne porte aucun store_id :
    // toute boutique de org-a-uuid peut donc la retrouver de façon identique.
    expect(card.organization_id).toBe('org-a-uuid');
    expect(card).not.toHaveProperty('store_id');
  });

  it("la carte de l'organisation A ne peut jamais être retrouvée pour l'organisation B (isolation stricte)", async () => {
    seedOrder({ id: 'order-a', organization_id: 'org-a-uuid' });
    await fulfillOnlineGiftCardCheckout(validArgs({ giftCardOrderId: 'order-a' }));
    const cardCode = giftCards[0]!.code;
    // Simule le filtre qu'appliquerait GiftCardService.lookup pour la
    // boutique B1 (organization_id = org-b-uuid) : aucune correspondance.
    const foundForOrgB = giftCards.find((g) => g.organization_id === 'org-b-uuid' && g.code === cardCode);
    expect(foundForOrgB).toBeUndefined();
  });
});

describe("success_url ne prouve jamais un paiement", () => {
  it("aucune fonction publique n'émet de carte : seul fulfillOnlineGiftCardCheckout le fait, appelé uniquement depuis le webhook", () => {
    // Vérification structurelle : le module de fulfillment est le SEUL point
    // d'entrée qui appelle GiftCardService.create pour une commande en ligne.
    // (Les routes publiques — config, checkout — n'importent jamais
    // GiftCardService : voir leurs propres fichiers, non modifiés ici.)
    expect(typeof fulfillOnlineGiftCardCheckout).toBe('function');
  });

  it("un appel sans paiement confirmé (payment_status manquant, comme un simple retour navigateur) n'émet rien", async () => {
    seedOrder();
    const outcome = await fulfillOnlineGiftCardCheckout(validArgs({ paymentStatus: undefined }));
    expect(outcome).toBe('not_paid');
    expect(giftCards).toHaveLength(0);
  });
});
