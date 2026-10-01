-- Catégorie d'une ligne de vente SANS produit rattaché (commandes entrantes
-- web / OGF — voir lib/services/order-intake.ts : ces lignes sont en prix
-- libre, product_id reste NULL, donc la catégorie ne peut jamais venir du
-- produit comme pour une vente caisse normale).
--
-- Colonne INDÉPENDANTE de products.category_id, jamais lue si la ligne a un
-- produit (le produit reste la source de vérité dans ce cas) : les requêtes
-- qui ventilent par catégorie doivent faire
-- COALESCE(products.category_id, sale_lines.category_id).
ALTER TABLE sale_lines
  ADD COLUMN category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;
