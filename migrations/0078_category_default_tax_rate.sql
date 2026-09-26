-- Taux de TVA par défaut d'une catégorie : pré-remplit automatiquement le
-- taux de TVA d'un produit selon la catégorie choisie, pour éviter les
-- erreurs de saisie à la création.
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS default_tax_rate_id UUID REFERENCES tax_rates(id) ON DELETE SET NULL;
