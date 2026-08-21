-- Packs d'articles (lots) : un pack REGROUPE plusieurs produits existants.
--
-- Le pack est lui-même un produit (il apparaît au catalogue, a un prix et une
-- TVA) mais SANS gestion de stock propre : à la vente, il éclate en ses
-- composants (chaque composant est décompté de son propre stock).
--
--   products.is_pack           : ce produit est un pack.
--   products.pack_discount_ttc : remise appliquée sur le total des composants.
--   product_pack_items         : composition (jusqu'à 5 composants).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_pack           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pack_discount_ttc NUMERIC(12,4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS product_pack_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  pack_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_id     uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity         NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  position         INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pack_items_pack ON product_pack_items (pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_items_component ON product_pack_items (component_id);
