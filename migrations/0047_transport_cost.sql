-- Coût de transport (achat) par catégorie, avec possibilité de surcharge par
-- article. Entre dans le calcul de la marge : marge HT = vente HT − (achat HT
-- + transport HT).
--
-- product_categories.transport_cost_ht : coût par défaut de la catégorie.
-- products.transport_cost_ht           : surcharge article (NULL = hérite de
--                                        la catégorie).
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS transport_cost_ht NUMERIC(12,4) NOT NULL DEFAULT 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS transport_cost_ht NUMERIC(12,4);
