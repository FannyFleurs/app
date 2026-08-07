-- Comptes de ventes par famille de produit, taux de TVA et boutique.
--
-- Le plan de comptes global (settings.accounting_accounts) ne connaît qu'UN
-- compte de ventes pour toute l'organisation. Un comptable attend le détail :
-- « 70731200 - PLANTES 10% PLANTES VERTE » — un compte par croisement famille ×
-- taux × boutique, avec son libellé.
--
-- Les trois critères sont facultatifs (NULL = « tous ») pour qu'une boutique
-- puisse être paramétrée finement sans obliger à saisir une ligne par
-- combinaison : une règle « toutes boutiques / toutes familles / 20 % » suffit
-- à démarrer, et les cas particuliers s'ajoutent au-dessus. La résolution
-- retient la règle la plus spécifique (cf. lib/services/accounting-mapping).
CREATE TABLE IF NOT EXISTS accounting_sales_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  -- NULL = s'applique à toutes les boutiques.
  store_id        uuid REFERENCES stores(id) ON DELETE CASCADE,
  -- NULL = s'applique à toutes les familles, y compris les articles sans famille.
  category_id     uuid REFERENCES product_categories(id) ON DELETE CASCADE,
  -- NULL = s'applique à tous les taux. Stocké en pourcentage (20, 10, 5.5…).
  vat_rate        numeric(5,2),
  account_code    text NOT NULL,
  account_label   text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Lecture du jeu de règles d'une organisation : c'est l'accès chaud, fait une
-- fois par export.
CREATE INDEX IF NOT EXISTS idx_acct_sales_accounts_org
  ON accounting_sales_accounts (organization_id);

-- Une seule règle par croisement : sans ça, deux lignes concurrentes rendraient
-- l'export non déterministe. `COALESCE` sur un UUID nul impossible en index
-- partiel → on passe par une expression normalisée.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_acct_sales_accounts_scope
  ON accounting_sales_accounts (
    organization_id,
    COALESCE(store_id,    '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(vat_rate, -1)
  );
