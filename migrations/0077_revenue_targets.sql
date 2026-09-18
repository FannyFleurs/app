-- Objectifs de chiffre d'affaires mensuels, par boutique.
--
-- L'exploitant fixe un objectif de CA (TTC) pour un mois donné et une boutique
-- donnée ; le tableau de bord et la page « Objectifs » (section Rapports)
-- comparent le réalisé du mois à cet objectif. Un objectif est propre à un mois
-- précis (saisonnalité : Saint-Valentin, fête des mères, Toussaint, Noël…).
CREATE TABLE IF NOT EXISTS revenue_targets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_ttc       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, store_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_revenue_targets_org_period
  ON revenue_targets (organization_id, year, month);
