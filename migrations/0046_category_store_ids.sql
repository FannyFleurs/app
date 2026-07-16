-- Catégories par boutique.
-- store_ids : boutiques où la catégorie est disponible. Vide = toutes les
-- boutiques (comportement historique / partagé). Sinon uniquement les
-- boutiques listées. Même convention que products.store_ids (migration 0025).
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS store_ids UUID[] NOT NULL DEFAULT '{}';
