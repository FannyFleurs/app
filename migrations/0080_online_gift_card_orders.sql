-- Tentatives d'achat de carte cadeau en ligne (étape 3 de l'intégration
-- "Cartes cadeaux en ligne"). Une ligne par tentative de paiement, créée en
-- 'pending' AVANT même d'appeler Stripe, pour que l'étape 4 (webhook) ait
-- toujours un état serveur fiable à mettre à jour — jamais uniquement des
-- metadata Stripe non persistées côté HelloPos.
--
-- Niveau ORGANISATION, comme les cartes cadeaux elles-mêmes : aucun store_id.
--
-- IMPORTANT : cette table ne fait que TRACER la tentative d'achat. Elle ne
-- déclenche jamais, à elle seule, l'émission d'une carte cadeau — seul le
-- futur webhook Stripe (étape 4), après confirmation serveur-à-serveur du
-- paiement, aura le droit de faire passer une ligne en 'paid' puis 'issued'
-- et de créer la carte via GiftCardService (non modifié par cette migration).
CREATE TABLE online_gift_card_orders (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

    -- Référence publique communiquée à l'acheteur (ex. GC-XXXXXXXX) — non
    -- séquentielle, distincte de l'id interne.
    public_reference            TEXT NOT NULL,

    amount_cents                INTEGER NOT NULL CHECK (amount_cents > 0),
    currency                    TEXT NOT NULL DEFAULT 'eur',

    buyer_name                  TEXT NOT NULL,
    buyer_email                 TEXT NOT NULL,
    recipient_name               TEXT NOT NULL,
    recipient_email              TEXT NOT NULL,
    message                     TEXT,

    status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','paid','issued','failed','expired','refunded')),

    stripe_checkout_session_id  TEXT,
    stripe_payment_intent_id    TEXT,
    -- Renseigné seulement à l'étape 4, une fois la carte réellement émise.
    gift_card_id                UUID REFERENCES gift_cards(id),

    -- Idempotence (fournie par le site appelant, optionnelle) : une même
    -- tentative rejouée (double-clic, retry réseau) ne doit pas créer deux
    -- lignes ni deux Checkout Sessions Stripe pour la même organisation.
    -- request_fingerprint permet de détecter qu'une clé est réutilisée avec
    -- un contenu DIFFÉRENT (conflit, à refuser) plutôt que la même tentative.
    idempotency_key             TEXT,
    request_fingerprint         TEXT,

    -- Traçabilité anti-abus (voir lib/services/online-gift-card-orders.ts) :
    -- sert de base à la limitation de débit, persistée donc valable même en
    -- environnement serverless multi-instance.
    client_ip                   TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at                     TIMESTAMPTZ,

    -- NULL admis plusieurs fois par PostgreSQL (comportement standard d'un
    -- UNIQUE simple) : les lignes sans session Stripe encore créée, ou sans
    -- clé d'idempotence fournie, ne se bloquent pas entre elles.
    UNIQUE (public_reference),
    UNIQUE (stripe_checkout_session_id)
);

CREATE INDEX idx_online_gift_card_orders_org ON online_gift_card_orders (organization_id);
CREATE INDEX idx_online_gift_card_orders_status ON online_gift_card_orders (status);
-- Fenêtre de limitation de débit : compte des tentatives récentes par
-- organisation et/ou par IP (voir checkRateLimit).
CREATE INDEX idx_online_gift_card_orders_org_created ON online_gift_card_orders (organization_id, created_at);
CREATE INDEX idx_online_gift_card_orders_ip_created ON online_gift_card_orders (client_ip, created_at);
-- Une même organisation ne doit jamais avoir deux lignes pour la même clé
-- d'idempotence (l'unicité globale de idempotency_key seul n'aurait pas de
-- sens : deux organisations différentes peuvent recevoir la même clé si deux
-- sites intégrateurs choisissent le même schéma de génération côté front).
CREATE UNIQUE INDEX idx_online_gift_card_orders_org_idempotency
  ON online_gift_card_orders (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
