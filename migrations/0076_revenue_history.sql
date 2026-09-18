-- Historique de chiffre d'affaires importé (comparatif N-1).
--
-- Le tableau de bord compare la période courante à l'an dernier à partir des
-- ventes enregistrées dans HelloPos. Pour les périodes ANTÉRIEURES à l'usage
-- de HelloPos (ou saisies dans un autre outil), il n'existe aucune vente : le
-- N-1 vaut alors zéro. Cette table stocke un CA journalier PAR BOUTIQUE, importé
-- depuis un fichier, pour nourrir ce comparatif — indépendamment du poste de
-- caisse (donnée rangée au niveau organisation / boutique).
--
--   ca_ttc / ca_ht : chiffre d'affaires du jour (HT optionnel).
--   tickets        : nombre de tickets du jour (optionnel), pour le ticket moyen N-1.
--
-- Règle d'usage (appliquée à la lecture, pas ici) : pour une même boutique / un
-- même jour, les VENTES RÉELLES priment ; l'historique importé ne comble que
-- les jours sans vente.
CREATE TABLE IF NOT EXISTS revenue_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day              date NOT NULL,
  ca_ttc           NUMERIC(12,2) NOT NULL DEFAULT 0,
  ca_ht            NUMERIC(12,2),
  tickets          INTEGER,
  source           TEXT NOT NULL DEFAULT 'import',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, store_id, day)
);

CREATE INDEX IF NOT EXISTS idx_revenue_history_org_day
  ON revenue_history (organization_id, day);
CREATE INDEX IF NOT EXISTS idx_revenue_history_store_day
  ON revenue_history (store_id, day);
