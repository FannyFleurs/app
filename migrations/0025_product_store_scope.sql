-- Migration 0025 : portee des produits par boutique.
--
-- Une entreprise multi-boutiques peut avoir des catalogues distincts.
-- Ex : 2 boutiques "Fanny Fleurs" partagent leur catalogue et 1
-- boutique "Plante Verte" a un catalogue different.
--
-- Regle : store_ids est un array de store_id. Un produit est visible
-- (caisse + stock + inventaire) uniquement dans les boutiques listees.
-- SEMANTIQUE : NULL ou array vide = "visible dans TOUTES les boutiques"
-- (pratique pour la retrocompat des produits existants).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS store_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_products_store_ids
  ON products USING GIN (store_ids);
