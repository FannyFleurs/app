-- Migration 0043 : écran atelier — numéro attribué à chaque composition
-- lors de la préparation (ex. n° de seau / d'emplacement en chambre froide).
-- Pour les commandes différées : colonne sur order_lines.
-- Pour les ventes caisse retrait/livraison : stocké dans
-- sales.delivery_info->'prepared_numbers' (JSONB mutable, non fiscal).

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS prepared_number TEXT;
