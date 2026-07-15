-- Modes de règlement par boutique.
-- store_ids : liste des boutiques où le mode est proposé. Vide = toutes les
-- boutiques (comportement historique). Sinon, uniquement les boutiques listées.
-- Même convention que products.store_ids (migration 0025).
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS store_ids UUID[] NOT NULL DEFAULT '{}';
