-- Permet d'épingler un produit sur la première ligne de la grille catégories en caisse.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_top_product BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_top
  ON products (organization_id, is_top_product)
  WHERE is_top_product = TRUE;
