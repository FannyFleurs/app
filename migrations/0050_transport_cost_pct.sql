-- Coût de transport en pourcentage (du prix d'achat HT), au niveau catégorie.
-- Alternative au montant fixe transport_cost_ht : si le % est renseigné, il
-- prime et le coût effectif = prix d'achat HT × pct / 100.
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS transport_cost_pct NUMERIC(6,3);
