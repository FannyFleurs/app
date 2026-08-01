-- Multi-EAN : un article peut avoir plusieurs codes-barres.
--
-- Le code principal reste `products.barcode` (utilisé pour l'étiquette et
-- l'affichage). Les codes SUPPLÉMENTAIRES sont stockés dans `extra_barcodes`
-- (tableau de texte). Le scan résout un article via son code principal, son SKU
-- OU l'un de ses codes supplémentaires.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS extra_barcodes TEXT[] NOT NULL DEFAULT '{}';

-- Index GIN pour résoudre rapidement un scan sur un code supplémentaire.
CREATE INDEX IF NOT EXISTS idx_products_extra_barcodes
  ON products USING GIN (extra_barcodes);
