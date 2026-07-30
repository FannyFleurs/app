-- Opt-out fidélité par client.
-- La fidélité est ACTIVE PAR DÉFAUT pour chaque client (TRUE). Décochée sur la
-- fiche client, les achats du client ne génèrent aucun point et aucun point
-- n'est utilisable pour lui.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN NOT NULL DEFAULT TRUE;
