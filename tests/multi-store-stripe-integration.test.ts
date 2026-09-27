import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { loadStripeSettings, saveStripeSettings } from '@/lib/settings/stripe-server';
import {
  loadOnlineGiftCards, saveOnlineGiftCards, resolveActiveOnlineGiftCards,
} from '@/lib/settings/online-gift-cards-server';
import { mergeStripeDefaults } from '@/lib/settings/stripe';
import { mergeOnlineGiftCardsDefaults } from '@/lib/settings/online-gift-cards';
import { createPendingOrder } from '@/lib/services/online-gift-card-orders';
import { fulfillOnlineGiftCardCheckout } from '@/lib/services/online-gift-card-fulfillment';
import { GET as configGET } from '@/app/api/public/gift-cards/config/route';

/**
 * Stripe / cartes cadeaux en ligne PAR BOUTIQUE — intégration contre une
 * VRAIE base Postgres (voir tests/gift-card-accounting.test.ts pour le même
 * choix côté comptabilité : trop de requêtes SQL interdépendantes pour
 * rester crédible derrière un mock).
 *
 * Nécessite DATABASE_URL — voir ce fichier et gift-card-accounting.test.ts.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Stripe & cartes cadeaux en ligne par boutique — intégration DB', () => {
  let organizationId: string;
  let storeAId: string; // Fanny Fleurs
  let storeBId: string; // Plante Verte

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Multi-Store ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;

    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deux boutiques de la même organisation, deux comptes Stripe différents — isolation totale', async () => {
    await saveStripeSettings(organizationId, storeAId, mergeStripeDefaults({
      enabled: true, publishable_key: 'pk_test_ff', secret_key: 'sk_test_ff_secret', webhook_secret: 'whsec_ff',
    }), null);
    await saveStripeSettings(organizationId, storeBId, mergeStripeDefaults({
      enabled: true, publishable_key: 'pk_test_pv', secret_key: 'sk_test_pv_secret', webhook_secret: 'whsec_pv',
    }), null);

    const loadedA = await loadStripeSettings(organizationId, storeAId);
    const loadedB = await loadStripeSettings(organizationId, storeBId);

    expect(loadedA.settings.secret_key).toBe('sk_test_ff_secret');
    expect(loadedA.settings.webhook_secret).toBe('whsec_ff');
    expect(loadedA.ownStore).toBe(true);

    expect(loadedB.settings.secret_key).toBe('sk_test_pv_secret');
    expect(loadedB.settings.webhook_secret).toBe('whsec_pv');
    expect(loadedB.ownStore).toBe(true);

    // Confirmation explicite : jamais les credentials de l'autre boutique.
    expect(loadedA.settings.secret_key).not.toBe(loadedB.settings.secret_key);

    // Aucune écriture accidentelle sous la clé organisation (`stripe` seule) :
    // chaque sauvegarde scoped ne touche QUE sa propre clé `stripe:<storeId>`.
    const orgLevel = await query<{ n: string }>(
      `SELECT COUNT(*)::text n FROM settings WHERE organization_id = $1 AND key = 'stripe'`,
      [organizationId],
    );
    expect(orgLevel.rows[0]!.n).toBe('0');
  });

  it("une boutique SANS configuration Stripe propre retombe sur l'organisation, jamais sur une AUTRE boutique", async () => {
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'NEW', 'Nouvelle Boutique') RETURNING id`,
      [organizationId],
    );
    const newStoreId = store.rows[0]!.id;

    // Config ORGANISATION (repli), distincte des deux boutiques ci-dessus.
    await saveStripeSettings(organizationId, null, mergeStripeDefaults({
      enabled: true, publishable_key: 'pk_test_org', secret_key: 'sk_test_org_secret', webhook_secret: 'whsec_org',
    }), null);

    const loaded = await loadStripeSettings(organizationId, newStoreId);
    expect(loaded.ownStore).toBe(false);
    expect(loaded.settings.secret_key).toBe('sk_test_org_secret');
    // Jamais les credentials de Fanny Fleurs ou Plante Verte (configurées
    // dans le test précédent).
    expect(loaded.settings.secret_key).not.toBe('sk_test_ff_secret');
    expect(loaded.settings.secret_key).not.toBe('sk_test_pv_secret');
  });

  it('les secrets Stripe sont chiffrés au repos quand SECRETS_ENCRYPTION_KEY est configurée', async () => {
    if (!process.env.SECRETS_ENCRYPTION_KEY) return; // testé séparément dans secret-crypto.test.ts sinon
    await saveStripeSettings(organizationId, storeAId, mergeStripeDefaults({
      enabled: true, secret_key: 'sk_test_encrypted_check', webhook_secret: 'whsec_encrypted_check',
    }), null);
    const raw = await query<{ value: { secret_key: string; webhook_secret: string } }>(
      `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
      [organizationId, `stripe:${storeAId}`],
    );
    expect(raw.rows[0]!.value.secret_key).not.toBe('sk_test_encrypted_check');
    expect(raw.rows[0]!.value.secret_key.startsWith('enc:v1:')).toBe(true);
    // Mais reste lisible via loadStripeSettings (déchiffrement transparent).
    const loaded = await loadStripeSettings(organizationId, storeAId);
    expect(loaded.settings.secret_key).toBe('sk_test_encrypted_check');
    expect(loaded.decryptionFailed).toBe(false);
  });

  it("chaque boutique a sa PROPRE configuration « cartes cadeaux en ligne », clé publique distincte", async () => {
    const cfgA = await loadOnlineGiftCards(organizationId, storeAId);
    const cfgB = await loadOnlineGiftCards(organizationId, storeBId);
    expect(cfgA.public_key).not.toBe(cfgB.public_key);

    await saveOnlineGiftCards(organizationId, storeAId, mergeOnlineGiftCardsDefaults({
      ...cfgA, enabled: true, allowed_origins: ['https://fanny-fleurs.com'],
    }), null);
    await saveOnlineGiftCards(organizationId, storeBId, mergeOnlineGiftCardsDefaults({
      ...cfgB, enabled: true, allowed_origins: ['https://plante-verte.fr'],
    }), null);

    const resolvedA = await resolveActiveOnlineGiftCards(cfgA.public_key);
    const resolvedB = await resolveActiveOnlineGiftCards(cfgB.public_key);
    expect(resolvedA?.storeId).toBe(storeAId);
    expect(resolvedB?.storeId).toBe(storeBId);
  });

  it('le widget Plante Verte affiche "Plante Verte" (jamais le nom de l\'organisation ni de Fanny Fleurs)', async () => {
    const cfgB = await loadOnlineGiftCards(organizationId, storeBId);
    const res = await configGET(new Request(`https://x.test/api/public/gift-cards/config?key=${cfgB.public_key}`, {
      headers: { origin: 'https://plante-verte.fr' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.store?.name).toBe('Plante Verte');
    expect(body.store?.name).not.toBe('Fanny Fleurs');
  });

  it('bout-en-bout : carte cadeau achetée en ligne pour Plante Verte, avec sa boutique/session de caisse propre', async () => {
    const register = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name) VALUES ($1, $2, 'PVR', 'Caisse PV') RETURNING id`,
      [organizationId, storeBId],
    );
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur PV', 'owner') RETURNING id`,
      [organizationId, `pv-${randomUUID()}@example.test`],
    );

    // Achat en ligne : commande créée avec le storeId RÉSOLU serveur (jamais
    // fourni par le client) — reproduit exactement ce que fait la route de
    // checkout après resolveActiveOnlineGiftCards.
    const order = await createPendingOrder({
      organizationId, storeId: storeBId, amountCents: 4000,
      buyerName: 'Acheteur', buyerEmail: 'acheteur@example.test',
      recipientName: 'Bénéficiaire', recipientEmail: 'beneficiaire@example.test',
      message: null, deliveryMode: 'recipient',
      idempotencyKey: null, requestFingerprint: null, clientIp: null,
    });
    const stripeSessionId = `cs_test_pv_${randomUUID()}`;
    await query(`UPDATE online_gift_card_orders SET stripe_checkout_session_id = $2 WHERE id = $1`, [order.id, stripeSessionId]);

    // Webhook confirmé (simulé directement au niveau service — la route
    // HTTP/signature est testée séparément dans webhook-stripe-gift-cards.test.ts).
    const paidAt = '2026-09-27T15:00:00.000Z'; // dimanche, boutique fermée
    const outcome = await fulfillOnlineGiftCardCheckout({
      organizationId, giftCardOrderId: order.id, stripeSessionId,
      paymentStatus: 'paid', amountTotalCents: 4000, currency: 'eur',
      paymentIntentId: 'pi_test_pv', eventCreatedAt: paidAt,
    });
    expect(outcome).toBe('issued');

    // La commande a bien reçu une carte, et paid_at est l'instant RÉEL du
    // paiement (jamais "now" du traitement du webhook).
    const orderRow = await query<{ gift_card_id: string; paid_at: string; status: string }>(
      `SELECT gift_card_id, paid_at, status FROM online_gift_card_orders WHERE id = $1`, [order.id],
    );
    expect(orderRow.rows[0]!.status).toBe('issued');
    expect(new Date(orderRow.rows[0]!.paid_at).toISOString()).toBe(paidAt);

    // Encaissement en attente : aucune session Plante Verte ouverte au
    // moment du paiement => statut "en attente", occurred_at = paidAt.
    const pending = await query<{ cash_session_id: string | null; occurred_at: string; amount_cents: number; store_id: string }>(
      `SELECT cash_session_id, occurred_at, amount_cents, store_id FROM pending_store_operations
        WHERE source_type = 'online_gift_card_order' AND source_id = $1`, [order.id],
    );
    expect(pending.rows).toHaveLength(1);
    expect(pending.rows[0]!.cash_session_id).toBeNull();
    expect(pending.rows[0]!.store_id).toBe(storeBId);
    expect(pending.rows[0]!.amount_cents).toBe(4000);
    expect(new Date(pending.rows[0]!.occurred_at).toISOString()).toBe(paidAt);

    // Ouverture suivante d'une session Plante Verte : rattachement automatique.
    const { CashSessionService } = await import('@/lib/services/cash-session-service');
    const session = await CashSessionService.open({
      organizationId, storeId: storeBId, registerId: register.rows[0]!.id, userId: user.rows[0]!.id, openingFloat: 0,
    });
    const afterOpen = await query<{ cash_session_id: string | null }>(
      `SELECT cash_session_id FROM pending_store_operations WHERE source_id = $1`, [order.id],
    );
    expect(afterOpen.rows[0]!.cash_session_id).toBe(session.id);

    // Rejeu idempotent du webhook (Stripe qui retente) : jamais une seconde
    // carte, jamais une seconde ligne d'encaissement en attente.
    const replay = await fulfillOnlineGiftCardCheckout({
      organizationId, giftCardOrderId: order.id, stripeSessionId,
      paymentStatus: 'paid', amountTotalCents: 4000, currency: 'eur',
      paymentIntentId: 'pi_test_pv', eventCreatedAt: paidAt,
    });
    expect(replay).toBe('already_issued');
    const countAfterReplay = await query<{ n: string }>(
      `SELECT COUNT(*)::text n FROM pending_store_operations WHERE source_id = $1`, [order.id],
    );
    expect(countAfterReplay.rows[0]!.n).toBe('1');
  });
});
