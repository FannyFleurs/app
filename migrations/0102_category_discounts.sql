-- Remise automatique par catégorie, PAR BOUTIQUE (page Catégories) :
-- appliquée automatiquement en caisse à chaque article de la catégorie,
-- comme la remise propre à un article (products.discount_type/value), mais
-- réglable boutique par boutique et pour une période précise (opération
-- commerciale) ou en permanence (case « toujours active »).
--
-- Une ligne par (catégorie, boutique) : l'absence de ligne = pas de remise
-- automatique pour cette boutique. always_active=TRUE ⇔ pas de bornes de
-- date ; sinon les deux bornes sont obligatoires (la remise n'est active
-- qu'entre start_date et end_date inclus).
CREATE TABLE IF NOT EXISTS category_discounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id      UUID NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  discount_type    TEXT NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_value   NUMERIC(12,4) NOT NULL CHECK (discount_value > 0),
  always_active    BOOLEAN NOT NULL DEFAULT FALSE,
  start_date       DATE,
  end_date         DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (category_id, store_id),
  CHECK (
    (always_active AND start_date IS NULL AND end_date IS NULL)
    OR (NOT always_active AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)
  )
);

CREATE INDEX IF NOT EXISTS idx_category_discounts_store ON category_discounts (store_id);
