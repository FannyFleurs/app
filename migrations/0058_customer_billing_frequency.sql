-- Fréquence de facturation d'un client « en compte » :
--   'manual'  : facturé à la demande (par défaut) ;
--   'monthly' : facture de période générée automatiquement chaque mois.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS billing_frequency TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_customers_billing_frequency
  ON customers (organization_id) WHERE billing_frequency = 'monthly';
