-- =========================================================================
-- Webpos POS — migration initiale
-- =========================================================================
-- Conventions :
--   * Toutes les tables ont id UUID PK
--   * organization_id présent pour le multi-tenant
--   * created_at / updated_at + created_by / updated_by lorsque mutable
--   * Tables fiscales : APPEND-ONLY, pas d'updated_at, triggers de protection
--   * Numérotation séquentielle : table dédiée avec lock atomique
--   * Hash chain : previous_hash + current_hash dans fiscal_events
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- -------------------------------------------------------------------------
-- 1. Organisations, boutiques, caisses
-- -------------------------------------------------------------------------

CREATE TABLE organizations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    legal_name    TEXT NOT NULL,
    siret         TEXT,
    vat_number    TEXT,
    address       JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact       JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    address         JSONB NOT NULL DEFAULT '{}'::jsonb,
    timezone        TEXT NOT NULL DEFAULT 'Europe/Paris',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, code)
);

CREATE TABLE registers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, code)
);

-- -------------------------------------------------------------------------
-- 2. Utilisateurs et droits (RBAC)
-- -------------------------------------------------------------------------
-- Rôles applicatifs : super_admin, owner, manager, vendeur, comptable,
--                     lecture_seule, support_technique
-- -------------------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    email           CITEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN (
        'super_admin','owner','manager','vendeur','comptable',
        'lecture_seule','support_technique')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    twofa_secret    TEXT,
    twofa_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, email)
);

CREATE TABLE user_store_access (
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id  UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, store_id)
);

CREATE TABLE sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    ip           INET,
    user_agent   TEXT,
    issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);

-- -------------------------------------------------------------------------
-- 3. Taxes
-- -------------------------------------------------------------------------

CREATE TABLE tax_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code            TEXT NOT NULL,                -- ex: 'TVA20', 'TVA10', 'TVA55'
    label           TEXT NOT NULL,
    rate            NUMERIC(6,3) NOT NULL,        -- 20.000, 10.000, 5.500, 0.000
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, code)
);

-- -------------------------------------------------------------------------
-- 4. Catalogue produits
-- -------------------------------------------------------------------------

CREATE TABLE product_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    parent_id       UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    color           TEXT,
    icon            TEXT,
    position        INT NOT NULL DEFAULT 0,
    visible_in_pos  BOOLEAN NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_id         UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name                TEXT NOT NULL,
    short_description   TEXT,
    long_description    TEXT,
    sku                 TEXT,
    barcode             TEXT,
    supplier_ref        TEXT,
    image_url           TEXT,
    unit                TEXT NOT NULL DEFAULT 'unité',
    tax_rate_id         UUID NOT NULL REFERENCES tax_rates(id) ON DELETE RESTRICT,
    purchase_price_ht   NUMERIC(12,4),
    sale_price_ttc      NUMERIC(12,4) NOT NULL,
    price_is_free       BOOLEAN NOT NULL DEFAULT FALSE,  -- bouquet prix libre
    track_stock         BOOLEAN NOT NULL DEFAULT FALSE,
    min_stock           NUMERIC(12,3),
    max_stock           NUMERIC(12,3),
    is_seasonal         BOOLEAN NOT NULL DEFAULT FALSE,
    is_customizable     BOOLEAN NOT NULL DEFAULT FALSE,
    visible_in_pos      BOOLEAN NOT NULL DEFAULT TRUE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    tags                TEXT[] NOT NULL DEFAULT '{}',
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id),
    UNIQUE (organization_id, sku)
);

CREATE INDEX idx_products_org_active ON products (organization_id, is_active);
CREATE INDEX idx_products_barcode ON products (organization_id, barcode);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_name_trgm ON products USING gin (lower(name) gin_trgm_ops);

CREATE TABLE product_variants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label               TEXT NOT NULL,
    sku                 TEXT,
    barcode             TEXT,
    attributes          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- ex: {"taille":"M","couleur":"rose"}
    sale_price_ttc      NUMERIC(12,4),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique des changements de prix (audit produit, append-only)
CREATE TABLE product_price_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id      UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
    old_price_ttc   NUMERIC(12,4),
    new_price_ttc   NUMERIC(12,4) NOT NULL,
    reason          TEXT,
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 5. Stock (préparé Phase 2, schéma complet créé maintenant)
-- -------------------------------------------------------------------------

CREATE TABLE stock_levels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id      UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, product_id, variant_id)
);

CREATE TABLE stock_movements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id        UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
    movement_type     TEXT NOT NULL CHECK (movement_type IN
        ('purchase','sale','return','adjustment','loss','transfer_in','transfer_out','inventory')),
    quantity_delta    NUMERIC(12,3) NOT NULL,
    previous_quantity NUMERIC(12,3) NOT NULL,
    new_quantity      NUMERIC(12,3) NOT NULL,
    reason            TEXT,
    source_type       TEXT,
    source_id         UUID,
    user_id           UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_product ON stock_movements (product_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 6. Clients
-- -------------------------------------------------------------------------

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    type            TEXT NOT NULL DEFAULT 'particulier'
                    CHECK (type IN ('particulier','professionnel','collectivite','association')),
    first_name      TEXT,
    last_name       TEXT,
    company_name    TEXT,
    email           CITEXT,
    phone           TEXT,
    siret           TEXT,
    vat_number      TEXT,
    address         JSONB NOT NULL DEFAULT '{}'::jsonb,
    consent_email   BOOLEAN NOT NULL DEFAULT FALSE,
    consent_sms     BOOLEAN NOT NULL DEFAULT FALSE,
    internal_notes  TEXT,
    loyalty_code    TEXT,
    is_anonymized   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id)
);

CREATE INDEX idx_customers_search ON customers (organization_id, last_name, phone, email);

CREATE TABLE customer_addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label           TEXT,
    line1           TEXT,
    line2           TEXT,
    zip             TEXT,
    city            TEXT,
    country         TEXT DEFAULT 'FR',
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 7. Fidélité
-- -------------------------------------------------------------------------

CREATE TABLE loyalty_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    customer_id     UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    points_balance  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    account_id      UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE RESTRICT,
    movement_type   TEXT NOT NULL CHECK (movement_type IN
        ('earn','redeem','adjust','expire','cancel')),
    points_delta    INT NOT NULL,
    balance_after   INT NOT NULL,
    reason          TEXT,
    source_type     TEXT,
    source_id       UUID,
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 8. Ventes (cœur fiscal — append-only après scellement)
-- -------------------------------------------------------------------------
-- Cycle :
--   draft  -> on_hold -> validated (encaissée, scellée fiscalement)
--   validated -> cancelled_by_credit_note (avoir)
-- Une vente validée n'est JAMAIS supprimée ni modifiée directement.
-- -------------------------------------------------------------------------

CREATE TABLE sales (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    register_id         UUID NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
    cash_session_id     UUID,                          -- FK ajoutée plus bas
    user_id             UUID NOT NULL REFERENCES users(id),
    customer_id         UUID REFERENCES customers(id),
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','on_hold','validated','cancelled_by_credit_note')),
    receipt_number      TEXT,                          -- ex: T-2026-000123 (rempli à la validation)
    receipt_sequence    BIGINT,                        -- monotone par organization
    total_ht            NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_tva           NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_ttc           NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_discount      NUMERIC(12,4) NOT NULL DEFAULT 0,
    tva_breakdown       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{rate, base_ht, tva}]
    notes               TEXT,
    held_label          TEXT,
    validated_at        TIMESTAMPTZ,
    fiscal_event_id     UUID,                          -- pointer vers fiscal_events
    fiscal_hash         TEXT,                          -- hash de scellement
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, receipt_number)
);

CREATE INDEX idx_sales_org_status ON sales (organization_id, status, created_at DESC);
CREATE INDEX idx_sales_register_status ON sales (register_id, status);

CREATE TABLE sale_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    sale_id             UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    line_index          INT NOT NULL,
    product_id          UUID REFERENCES products(id),
    variant_id          UUID REFERENCES product_variants(id),
    label               TEXT NOT NULL,                -- snapshot du libellé
    unit_price_ttc      NUMERIC(12,4) NOT NULL,
    quantity            NUMERIC(12,3) NOT NULL,
    discount_amount     NUMERIC(12,4) NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(6,3) NOT NULL,        -- snapshot du taux (%)
    tax_rate_code       TEXT NOT NULL,
    line_ht             NUMERIC(12,4) NOT NULL,
    line_tva            NUMERIC(12,4) NOT NULL,
    line_ttc            NUMERIC(12,4) NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- ex: message carte, taille, etc.
    UNIQUE (sale_id, line_index)
);

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method          TEXT NOT NULL CHECK (method IN
        ('cash','card','check','transfer','gift_card','credit_note','deferred','other')),
    amount          NUMERIC(12,4) NOT NULL,
    given_amount    NUMERIC(12,4),                    -- pour rendu monnaie
    change_amount   NUMERIC(12,4),
    reference       TEXT,                             -- num carte cadeau, num avoir, etc.
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_sale ON payments (sale_id);

-- -------------------------------------------------------------------------
-- 9. Tickets (PDF généré, snapshot des données figées)
-- -------------------------------------------------------------------------

CREATE TABLE receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    sale_id         UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
    number          TEXT NOT NULL,
    sequence_value  BIGINT NOT NULL,
    snapshot        JSONB NOT NULL,                   -- état complet figé
    fiscal_hash     TEXT NOT NULL,
    pdf_path        TEXT,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, number)
);

-- -------------------------------------------------------------------------
-- 10. Factures et avoirs (Phase 2, schéma posé)
-- -------------------------------------------------------------------------

CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sale_id             UUID REFERENCES sales(id) ON DELETE RESTRICT,
    invoice_type        TEXT NOT NULL DEFAULT 'standard'
                        CHECK (invoice_type IN ('standard','proforma','deposit','balance','credit_note')),
    number              TEXT,                          -- F-2026-000123 ou A-2026-000045
    sequence_value      BIGINT,
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','validated','sent','paid','partially_paid','overdue','cancelled')),
    issue_date          DATE,
    service_date        DATE,
    due_date            DATE,
    total_ht            NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_tva           NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_ttc           NUMERIC(12,4) NOT NULL DEFAULT 0,
    tva_breakdown       JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_terms       TEXT,
    legal_mentions      TEXT,
    e_invoice_metadata  JSONB NOT NULL DEFAULT '{}'::jsonb,
    fiscal_hash         TEXT,
    fiscal_event_id     UUID,
    pdf_path            TEXT,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at        TIMESTAMPTZ,
    UNIQUE (organization_id, number)
);

CREATE TABLE invoice_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    line_index      INT NOT NULL,
    label           TEXT NOT NULL,
    quantity        NUMERIC(12,3) NOT NULL,
    unit_price_ht   NUMERIC(12,4) NOT NULL,
    discount_pct    NUMERIC(6,3) NOT NULL DEFAULT 0,
    tax_rate        NUMERIC(6,3) NOT NULL,
    tax_rate_code   TEXT NOT NULL,
    line_ht         NUMERIC(12,4) NOT NULL,
    line_tva        NUMERIC(12,4) NOT NULL,
    line_ttc        NUMERIC(12,4) NOT NULL,
    UNIQUE (invoice_id, line_index)
);

CREATE TABLE credit_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id      UUID REFERENCES invoices(id),
    sale_id         UUID REFERENCES sales(id),
    number          TEXT NOT NULL,
    sequence_value  BIGINT NOT NULL,
    amount          NUMERIC(12,4) NOT NULL,
    reason          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','partially_used','used','cancelled')),
    used_amount     NUMERIC(12,4) NOT NULL DEFAULT 0,
    fiscal_hash     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, number)
);

-- -------------------------------------------------------------------------
-- 11. Cartes cadeaux
-- -------------------------------------------------------------------------

CREATE TABLE gift_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code            TEXT NOT NULL UNIQUE,
    initial_amount  NUMERIC(12,4) NOT NULL,
    balance         NUMERIC(12,4) NOT NULL,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,
    buyer_id        UUID REFERENCES customers(id),
    beneficiary_id  UUID REFERENCES customers(id),
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','partially_used','used','expired','cancelled')),
    sale_id         UUID REFERENCES sales(id)
);

CREATE TABLE gift_card_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    gift_card_id    UUID NOT NULL REFERENCES gift_cards(id) ON DELETE RESTRICT,
    movement_type   TEXT NOT NULL CHECK (movement_type IN ('issue','use','refund','cancel','expire')),
    amount_delta    NUMERIC(12,4) NOT NULL,
    balance_after   NUMERIC(12,4) NOT NULL,
    sale_id         UUID REFERENCES sales(id),
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 12. Commandes et livraisons
-- -------------------------------------------------------------------------

CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    customer_id     UUID REFERENCES customers(id),
    number          TEXT,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','confirmed','in_preparation','ready','delivered','cancelled')),
    pickup_or_delivery TEXT NOT NULL DEFAULT 'pickup'
                    CHECK (pickup_or_delivery IN ('pickup','delivery')),
    requested_at    TIMESTAMPTZ,
    slot_label      TEXT,
    card_message    TEXT,
    recipient_name  TEXT,
    recipient_phone TEXT,
    delivery_address JSONB,
    deposit_amount  NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(12,4) NOT NULL DEFAULT 0,
    deposit_sale_id UUID REFERENCES sales(id),
    final_sale_id   UUID REFERENCES sales(id),
    invoice_id      UUID REFERENCES invoices(id),
    internal_notes  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_index      INT NOT NULL,
    product_id      UUID REFERENCES products(id),
    label           TEXT NOT NULL,
    quantity        NUMERIC(12,3) NOT NULL,
    unit_price_ttc  NUMERIC(12,4) NOT NULL,
    notes           TEXT,
    UNIQUE (order_id, line_index)
);

CREATE TABLE deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    order_id        UUID REFERENCES orders(id),
    scheduled_at    TIMESTAMPTZ,
    slot_label      TEXT,
    address         JSONB,
    recipient_name  TEXT,
    recipient_phone TEXT,
    driver_id       UUID REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','out_for_delivery','delivered','failed','cancelled')),
    fees            NUMERIC(12,4) NOT NULL DEFAULT 0,
    notes           TEXT,
    proof_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 13. Sessions de caisse et clôtures
-- -------------------------------------------------------------------------

CREATE TABLE cash_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    register_id         UUID NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
    opened_by           UUID NOT NULL REFERENCES users(id),
    closed_by           UUID REFERENCES users(id),
    opening_float       NUMERIC(12,4) NOT NULL DEFAULT 0,
    counted_cash        NUMERIC(12,4),
    expected_cash       NUMERIC(12,4),
    cash_variance       NUMERIC(12,4),
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed')),
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at           TIMESTAMPTZ,
    notes               TEXT
);

ALTER TABLE sales ADD CONSTRAINT sales_cash_session_fk
    FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE RESTRICT;

CREATE TABLE cash_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    cash_session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
    movement_type   TEXT NOT NULL CHECK (movement_type IN ('in','out')),
    amount          NUMERIC(12,4) NOT NULL,
    reason          TEXT NOT NULL,
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clôture journalière (par boutique, scellement quotidien)
CREATE TABLE daily_closures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    business_date       DATE NOT NULL,
    closed_by           UUID NOT NULL REFERENCES users(id),
    -- Cumuls
    total_sales         INT NOT NULL DEFAULT 0,
    total_ht            NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_tva           NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_ttc           NUMERIC(12,4) NOT NULL DEFAULT 0,
    tva_breakdown       JSONB NOT NULL DEFAULT '[]'::jsonb,
    payments_breakdown  JSONB NOT NULL DEFAULT '[]'::jsonb,
    discounts_total     NUMERIC(12,4) NOT NULL DEFAULT 0,
    credit_notes_total  NUMERIC(12,4) NOT NULL DEFAULT 0,
    cash_expected       NUMERIC(12,4) NOT NULL DEFAULT 0,
    cash_counted        NUMERIC(12,4),
    cash_variance       NUMERIC(12,4),
    -- Cumul perpétuel (grand total — exigence fiscale FR)
    grand_total_ttc_running NUMERIC(14,4) NOT NULL DEFAULT 0,
    -- Scellement
    fiscal_hash         TEXT NOT NULL,
    previous_hash       TEXT,
    fiscal_event_id     UUID,
    sealed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, business_date)
);

CREATE TABLE monthly_closures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    business_year       INT NOT NULL,
    business_month      INT NOT NULL CHECK (business_month BETWEEN 1 AND 12),
    closed_by           UUID NOT NULL REFERENCES users(id),
    total_ttc           NUMERIC(14,4) NOT NULL,
    total_ht            NUMERIC(14,4) NOT NULL,
    total_tva           NUMERIC(14,4) NOT NULL,
    tva_breakdown       JSONB NOT NULL,
    grand_total_ttc_running NUMERIC(14,4) NOT NULL,
    fiscal_hash         TEXT NOT NULL,
    previous_hash       TEXT,
    fiscal_event_id     UUID,
    sealed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, business_year, business_month)
);

CREATE TABLE yearly_closures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    business_year       INT NOT NULL,
    closed_by           UUID NOT NULL REFERENCES users(id),
    total_ttc           NUMERIC(14,4) NOT NULL,
    total_ht            NUMERIC(14,4) NOT NULL,
    total_tva           NUMERIC(14,4) NOT NULL,
    tva_breakdown       JSONB NOT NULL,
    grand_total_ttc_running NUMERIC(14,4) NOT NULL,
    fiscal_hash         TEXT NOT NULL,
    previous_hash       TEXT,
    fiscal_event_id     UUID,
    sealed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, business_year)
);

-- -------------------------------------------------------------------------
-- 14. Cœur fiscal — append-only, hash chain
-- -------------------------------------------------------------------------

CREATE TABLE fiscal_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id            UUID REFERENCES stores(id),
    register_id         UUID REFERENCES registers(id),
    user_id             UUID REFERENCES users(id),
    immutable_index     BIGINT NOT NULL,             -- compteur monotone par organization
    event_type          TEXT NOT NULL,               -- ex: SALE_VALIDATED, DAILY_CLOSURE_SEALED, ...
    entity_type         TEXT NOT NULL,               -- 'sale','invoice','closure',...
    entity_id           UUID,
    payload             JSONB NOT NULL,
    previous_hash       TEXT NOT NULL,
    current_hash        TEXT NOT NULL,
    signature_version   INT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, immutable_index),
    UNIQUE (current_hash)
);

CREATE INDEX idx_fiscal_events_entity ON fiscal_events (entity_type, entity_id);
CREATE INDEX idx_fiscal_events_created ON fiscal_events (organization_id, created_at);

-- Curseur de séquence par organization (lock atomique)
CREATE TABLE fiscal_chain_state (
    organization_id     UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
    next_index          BIGINT NOT NULL DEFAULT 1,
    last_hash           TEXT NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    grand_total_ttc     NUMERIC(14,4) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Séquences de numérotation (par organization + kind + year)
-- kinds : 'receipt', 'invoice', 'credit_note', 'order', 'gift_card'
CREATE TABLE document_sequences (
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    kind                TEXT NOT NULL,
    year                INT NOT NULL,
    next_value          BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (organization_id, kind, year)
);

-- Archives fiscales
CREATE TABLE fiscal_archives (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id        UUID REFERENCES stores(id),
    period_kind     TEXT NOT NULL CHECK (period_kind IN ('day','month','year','adhoc')),
    period_label    TEXT NOT NULL,
    range_start     TIMESTAMPTZ NOT NULL,
    range_end       TIMESTAMPTZ NOT NULL,
    file_path       TEXT NOT NULL,
    sha256          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    generated_by    UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 15. Audit applicatif (append-only)
-- -------------------------------------------------------------------------

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    user_id         UUID REFERENCES users(id),
    action          TEXT NOT NULL,
    entity_type     TEXT,
    entity_id       UUID,
    ip              INET,
    user_agent      TEXT,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    severity        TEXT NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info','warn','error','security')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org_time ON audit_logs (organization_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 16. Paramètres et exports comptables
-- -------------------------------------------------------------------------

CREATE TABLE settings (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    value           JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users(id),
    PRIMARY KEY (organization_id, key)
);

CREATE TABLE accounting_exports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    format          TEXT NOT NULL,                -- 'csv','fec_like','json'
    file_path       TEXT NOT NULL,
    sha256          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    generated_by    UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- Triggers d'immutabilité
-- =========================================================================

CREATE OR REPLACE FUNCTION fn_block_update_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'TABLE_APPEND_ONLY: % sur %.% interdit',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fiscal_events_no_update
    BEFORE UPDATE OR DELETE ON fiscal_events
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_audit_logs_no_update
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_daily_closures_no_update
    BEFORE UPDATE OR DELETE ON daily_closures
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_monthly_closures_no_update
    BEFORE UPDATE OR DELETE ON monthly_closures
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_yearly_closures_no_update
    BEFORE UPDATE OR DELETE ON yearly_closures
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_receipts_no_update
    BEFORE UPDATE OR DELETE ON receipts
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_payments_no_update
    BEFORE UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_price_history_no_update
    BEFORE UPDATE OR DELETE ON product_price_history
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_stock_movements_no_update
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_loyalty_movements_no_update
    BEFORE UPDATE OR DELETE ON loyalty_movements
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_giftcard_movements_no_update
    BEFORE UPDATE OR DELETE ON gift_card_movements
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

CREATE TRIGGER trg_fiscal_archives_no_update
    BEFORE UPDATE OR DELETE ON fiscal_archives
    FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();

-- Une vente validée ne peut plus être modifiée dans ses champs fiscaux
CREATE OR REPLACE FUNCTION fn_protect_validated_sale() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('validated','cancelled_by_credit_note') THEN
            RAISE EXCEPTION 'SALE_IMMUTABLE: suppression d''une vente validée interdite'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status = 'validated' AND NEW.status <> 'cancelled_by_credit_note' THEN
        -- Seul le passage vers cancelled_by_credit_note est toléré ; tout le reste figé
        IF NEW.total_ht <> OLD.total_ht
           OR NEW.total_tva <> OLD.total_tva
           OR NEW.total_ttc <> OLD.total_ttc
           OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
           OR NEW.fiscal_hash IS DISTINCT FROM OLD.fiscal_hash
           OR NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
            RAISE EXCEPTION 'SALE_IMMUTABLE: modification d''une vente validée interdite'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sales_protect
    BEFORE UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION fn_protect_validated_sale();

-- Une facture validée ne peut plus être modifiée
CREATE OR REPLACE FUNCTION fn_protect_validated_invoice() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'INVOICE_IMMUTABLE: suppression interdite'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status IN ('validated','sent','paid','partially_paid','overdue','cancelled') THEN
        IF NEW.total_ht <> OLD.total_ht
           OR NEW.total_tva <> OLD.total_tva
           OR NEW.total_ttc <> OLD.total_ttc
           OR NEW.number IS DISTINCT FROM OLD.number
           OR NEW.fiscal_hash IS DISTINCT FROM OLD.fiscal_hash THEN
            RAISE EXCEPTION 'INVOICE_IMMUTABLE: modification interdite'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_protect
    BEFORE UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION fn_protect_validated_invoice();

-- Auto-update du champ updated_at quand pertinent
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orgs_touch BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_stores_touch BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_registers_touch BEFORE UPDATE ON registers
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_categories_touch BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_deliveries_touch BEFORE UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_invoices_touch BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_tax_rates_touch BEFORE UPDATE ON tax_rates
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_variants_touch BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
CREATE TRIGGER trg_loyalty_accounts_touch BEFORE UPDATE ON loyalty_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- =========================================================================
-- Vues utiles
-- =========================================================================

CREATE VIEW v_sales_with_totals AS
SELECT
    s.id,
    s.organization_id,
    s.store_id,
    s.register_id,
    s.cash_session_id,
    s.status,
    s.receipt_number,
    s.total_ttc,
    s.total_ht,
    s.total_tva,
    s.validated_at,
    s.created_at,
    s.fiscal_hash,
    c.id   AS customer_id,
    COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_display
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id;
