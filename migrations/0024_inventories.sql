-- Migration 0024 : sessions d'inventaire.
--
-- Un inventaire est une session (draft → in_review → finalized) qui
-- rassemble des lignes (une par produit). A la finalisation, on ecrit
-- des stock_movements pour chaque delta != 0.
--
-- scope_type indique la portee :
--   total    : tous les produits actifs de la boutique
--   category : uniquement les produits dont category_id ∈ scope_ids
--   supplier : uniquement les produits dont supplier_ref ∈ scope_ids

CREATE TABLE IF NOT EXISTS inventories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  label           TEXT NOT NULL,
  scope_type      TEXT NOT NULL CHECK (scope_type IN ('total','category','supplier')),
  scope_ids       TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','in_review','finalized','cancelled')),
  created_by      UUID REFERENCES users(id),
  finalized_by    UUID REFERENCES users(id),
  finalized_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventories_org_status
  ON inventories (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id      UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_qty      NUMERIC(12,3) NOT NULL DEFAULT 0,
  counted_qty       NUMERIC(12,3) NOT NULL DEFAULT 0,
  purchase_price_ht NUMERIC(12,4),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_lines_inv
  ON inventory_lines (inventory_id);
