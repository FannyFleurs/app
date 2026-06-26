-- Pour la vente de cartes cadeau (et autres produits "prix fort") :
-- la remise systématique du client ne doit JAMAIS s'appliquer.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS no_discount BOOLEAN NOT NULL DEFAULT FALSE;

-- Solde "en compte" du client : somme algébrique de ses crédits/débits.
-- Convention :
--   • paiement method='deferred' à l'encaissement → débite (négatif)
--   • règlement ultérieur ("Régulariser le compte") → crédite (positif)
-- On le maintient via triggers + une vue mais pour V1 on stocke
-- simplement la valeur courante dans customers.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS account_balance NUMERIC(12,4) NOT NULL DEFAULT 0;
