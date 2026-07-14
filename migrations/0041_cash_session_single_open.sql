-- Migration 0041 : garde-fou contre deux sessions de caisse ouvertes en même
-- temps sur un même poste (double-tap / deux appareils). Index unique partiel.
-- Isolé de 0040 : s'il existait déjà des doublons ouverts, seule cette
-- migration échouerait (fail-open côté déploiement), sans perdre l'index perf.

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_one_open_per_register
  ON cash_sessions (register_id)
  WHERE status = 'open';
