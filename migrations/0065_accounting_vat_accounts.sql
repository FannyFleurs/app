-- Compte de TVA collectée par famille, taux et boutique.
--
-- Le compte de ventes (707…) reçoit le HT ; la TVA a son propre compte (4457…).
-- Le plan global n'en connaît qu'un par taux, ce qui suffit rarement à un
-- groupe : le comptable veut la même finesse que sur les ventes. Facultatif —
-- sans valeur, on retombe sur le compte de TVA global du taux concerné, et
-- l'export reste juste.
ALTER TABLE accounting_sales_accounts
  ADD COLUMN IF NOT EXISTS vat_account_code  text,
  ADD COLUMN IF NOT EXISTS vat_account_label text;
