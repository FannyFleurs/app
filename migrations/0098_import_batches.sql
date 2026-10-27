-- Lots d'import produits : pour que le PDA sache "quels articles viennent de
-- quel import" (réception + impression d'étiquettes, voir app/pda/). Avant
-- cette migration, un import ne laissait aucune trace exploitable au-delà
-- des produits eux-mêmes.
CREATE TABLE import_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    filename        TEXT,
    -- Boutiques ciblées par l'import (même convention que products.store_ids) :
    -- vide = toutes les boutiques de l'organisation.
    store_ids       UUID[] NOT NULL DEFAULT '{}',
    -- Décidé par l'utilisateur à la fin de l'import (Paramètres → Import
    -- produits) : seuls les lots avec sent_to_pda = TRUE apparaissent dans
    -- « Réception d'import » sur le PDA.
    sent_to_pda     BOOLEAN NOT NULL DEFAULT FALSE,
    product_count   INT NOT NULL DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_batch_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    -- NULL tant que l'article n'a pas été réceptionné depuis le PDA.
    received_qty    NUMERIC(12,3),
    received_at     TIMESTAMPTZ,
    received_by     UUID REFERENCES users(id),
    UNIQUE (import_batch_id, product_id)
);

CREATE INDEX idx_import_batches_org_pda ON import_batches (organization_id, sent_to_pda);
CREATE INDEX idx_import_batch_items_batch ON import_batch_items (import_batch_id);
