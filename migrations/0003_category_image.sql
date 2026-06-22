-- Ajoute la possibilité d'attacher une image à une catégorie pour
-- l'affichage dans la grille caisse.
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS image_url TEXT;
