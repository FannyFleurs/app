-- Facturation « en compte » par période : marque les ventes déjà regroupées
-- sur une facture de période, pour ne pas les refacturer.
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS account_invoice_id UUID REFERENCES invoices(id);

CREATE INDEX IF NOT EXISTS idx_sales_account_invoice
  ON sales (customer_id) WHERE account_invoice_id IS NULL;
