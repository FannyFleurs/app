-- Rattache chaque ligne de facture à la vente d'origine.
-- Permet de regrouper les lignes par vente sur la facture (notamment les
-- factures de PÉRIODE qui agrègent plusieurs ventes) et d'afficher le
-- commentaire de chaque vente au sein de ses lignes.
ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS sale_id UUID;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_sale
  ON invoice_lines (sale_id) WHERE sale_id IS NOT NULL;
