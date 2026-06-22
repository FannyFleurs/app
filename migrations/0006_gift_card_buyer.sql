-- Coordonnées libres de l'acheteur d'une carte cadeau (sans obliger à créer un client).
ALTER TABLE gift_cards
  ADD COLUMN IF NOT EXISTS buyer_name  TEXT,
  ADD COLUMN IF NOT EXISTS buyer_phone TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email TEXT,
  ADD COLUMN IF NOT EXISTS message     TEXT;

CREATE INDEX IF NOT EXISTS idx_gift_cards_search
  ON gift_cards (organization_id, lower(buyer_name), buyer_phone);
