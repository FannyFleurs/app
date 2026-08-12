-- Archivage d'une fiche client.
--
-- Les doublons s'accumulent : un client saisi deux fois au comptoir, un import
-- qui repasse. On ne peut pas les supprimer — leurs tickets, factures et avoirs
-- font partie de l'historique fiscal. On les met donc de côté : la fiche existe
-- toujours, elle ne remonte simplement plus dans les recherches, ni au
-- back-office ni en caisse.
--
-- La date sert d'état ET de trace : NULL = fiche active, sinon on sait quand
-- elle a été rangée. Réversible d'un clic (remise à NULL).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Toutes les recherches clients passent par « archived_at IS NULL » : l'index
-- partiel ne porte que sur les fiches actives, celles que l'on interroge.
CREATE INDEX IF NOT EXISTS idx_customers_actifs
    ON customers (organization_id)
 WHERE archived_at IS NULL;
