-- Migration 0040 : index sur la recherche de la session de caisse ouverte.
-- getOpenForRegister() est appelé à chaque ouverture de caisse :
--   WHERE register_id = $1 AND status = 'open' ORDER BY opened_at DESC
-- Sans index, dégénère en seq-scan à mesure que l'historique grossit.

CREATE INDEX IF NOT EXISTS idx_cash_sessions_register_open
  ON cash_sessions (register_id, opened_at DESC)
  WHERE status = 'open';
