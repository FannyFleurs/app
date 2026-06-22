-- Remise systématique pour un client : si renseignée (>0),
-- elle s'applique automatiquement à chaque vente du client.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS default_discount_pct NUMERIC(5,2);
