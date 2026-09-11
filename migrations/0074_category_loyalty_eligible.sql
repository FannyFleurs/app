-- Éligibilité fidélité par catégorie.
--
-- On peut désormais décider, catégorie par catégorie, si les articles qu'elle
-- contient génèrent des points de fidélité. Les articles d'une catégorie non
-- éligible sont exclus du calcul de gain (comme les articles no_discount).
-- Défaut TRUE : comportement inchangé pour l'existant.
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS loyalty_eligible BOOLEAN NOT NULL DEFAULT TRUE;
