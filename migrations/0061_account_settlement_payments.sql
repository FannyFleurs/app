-- Règlements d'un solde « en compte » encaissés en caisse (via l'écran de
-- paiement classique) : un enregistrement par mode de règlement, pour les
-- faire apparaître sur le Z (« Règlements en compte ») sans gonfler le CA.
CREATE TABLE IF NOT EXISTS account_settlement_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  store_id         UUID REFERENCES stores(id) ON DELETE SET NULL,
  cash_session_id  UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES users(id),
  method           TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL,
  reference        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asp_store_date
  ON account_settlement_payments (store_id, created_at);
