-- Migration 0039 : remise au niveau de l'article (pour l'affichage d'un prix
-- barré / prix remisé sur l'étiquette). Type 'percent' (%) ou 'amount' (€).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS discount_type  TEXT
    CHECK (discount_type IN ('percent', 'amount')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,4);
