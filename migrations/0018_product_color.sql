-- Permet de personnaliser la couleur de fond d'un article sur les
-- tuiles caisse, indépendamment de la couleur de sa catégorie.
-- NULL = pas de couleur définie → la tuile garde son style par défaut
-- (fond blanc) ; sinon → background = color.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS color TEXT;

COMMENT ON COLUMN products.color IS
  'Couleur de fond (#RRGGBB) pour les tuiles caisse — NULL = aucune.';
