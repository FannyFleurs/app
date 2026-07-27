-- Distingue deux natures de crédit prépayé stockées dans `gift_cards` :
--   - 'gift_card' : carte cadeau vendue à sa valeur faciale (défaut) ;
--   - 'voucher'   : bon d'achat, remisable jusqu'à 100 % (geste commercial),
--                   la carte conservant sa valeur faciale.
-- Les deux partagent la même logique de rédemption (paiement par solde).
-- Pas de contrainte CHECK : on ne veut pas casser d'éventuelles lignes
-- existantes. Idempotent (IF NOT EXISTS).
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'gift_card';
