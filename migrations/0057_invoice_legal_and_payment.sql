-- Facturation : informations légales, mode de règlement, conditions.

-- Identité légale de l'organisation affichée en pied de facture.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS capital_social TEXT,
  ADD COLUMN IF NOT EXISTS ape_code TEXT;

-- Conditions de règlement par défaut d'un client (code : on_receipt, net_30…).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- Mode de règlement (libellé) et date de règlement d'une facture.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
