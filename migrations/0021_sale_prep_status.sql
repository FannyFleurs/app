-- Permet de suivre l'état de préparation d'une vente caisse marquée
-- "retrait" ou "livraison" via OrderModal. Ces ventes sont déjà validées
-- fiscalement, mais elles entrent dans le workflow de préparation
-- comme les commandes différées :
--   confirmed → in_preparation → ready → delivered
--   (ou cancelled à tout moment)
--
-- Indépendant du statut fiscal de la vente (sales.status) qui reste
-- 'validated' pour toutes les ventes encaissées.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS prep_status TEXT
       CHECK (prep_status IN ('confirmed','in_preparation','ready','delivered','cancelled'));

CREATE INDEX IF NOT EXISTS idx_sales_prep_status
  ON sales (organization_id, prep_status)
  WHERE prep_status IS NOT NULL;
