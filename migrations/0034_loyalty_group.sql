-- ---------------------------------------------------------------------------
-- 0034 — Fidélité segmentée par groupe de boutiques
-- ---------------------------------------------------------------------------
-- Jusqu'ici, un client a UN compte fidélité par organisation (commun à
-- toutes les boutiques). À partir de l'offre Croissance, l'exploitant peut
-- choisir de cloisonner la fidélité par groupe de boutiques : chaque groupe
-- possède alors son propre solde de points pour un même client.
--
-- On ajoute une clé de groupe au compte fidélité. La valeur '*' correspond
-- au groupe « commun à toutes les boutiques » (comportement historique).
-- Les comptes existants restent donc sur '*' : aucune perte de points.
-- ---------------------------------------------------------------------------

ALTER TABLE loyalty_accounts
  ADD COLUMN IF NOT EXISTS group_key TEXT NOT NULL DEFAULT '*';

-- L'unicité passe de (customer_id) à (customer_id, group_key) : un client
-- peut désormais avoir plusieurs comptes (un par groupe).
ALTER TABLE loyalty_accounts DROP CONSTRAINT IF EXISTS loyalty_accounts_customer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_accounts_customer_group_uk
  ON loyalty_accounts (customer_id, group_key);
