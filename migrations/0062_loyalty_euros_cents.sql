-- Fidélité : passage du solde en euros AVEC centimes + correction des imports.
--
-- Contexte : l'app stocke le solde fidélité en EUROS dans `points_balance`
-- (1 « point » applicatif = 1 €). Les colonnes étaient en INT — impossible
-- de représenter une valeur en centimes (ex. 3,40 €). L'ancien logiciel de la
-- cliente utilisait un vrai barème en POINTS (100 points = 5 €, soit 1 € dépensé
-- = 1 point). À l'import, ces points bruts ont été copiés tels quels : une
-- cliente avec 68 points affiche 68 € au lieu de 68 × 0,05 = 3,40 €.
--
-- Ce script :
--   1. autorise les centimes (NUMERIC(12,2)) ;
--   2. corrige les comptes issus UNIQUEMENT d'un import, en convertissant leur
--      solde au barème de l'organisation (euros_earned / per_euros_spent, ex.
--      5/100 = 0,05 €/point), via un mouvement de régularisation append-only
--      (on ne réécrit jamais l'historique : trigger anti-UPDATE).

-- 1. Centimes autorisés (DDL — ne déclenche pas le trigger append-only).
ALTER TABLE loyalty_accounts  ALTER COLUMN points_balance TYPE NUMERIC(12,2);
ALTER TABLE loyalty_movements ALTER COLUMN points_delta   TYPE NUMERIC(12,2);
ALTER TABLE loyalty_movements ALTER COLUMN balance_after  TYPE NUMERIC(12,2);

-- 2. Correction des soldes importés (append-only : on POSTE une régularisation,
--    on ne modifie pas les mouvements d'import existants).
WITH rates AS (
  SELECT o.id AS org_id,
         COALESCE(
           NULLIF((s.value->'loyalty'->>'euros_earned'), '')::numeric
             / NULLIF((s.value->'loyalty'->>'per_euros_spent')::numeric, 0),
           0.05
         ) AS rate
    FROM organizations o
    LEFT JOIN settings s
      ON s.organization_id = o.id AND s.key = 'pos_ui'
),
targets AS (
  SELECT la.id AS account_id, la.organization_id,
         la.points_balance AS old_bal,
         ROUND(la.points_balance * r.rate, 2) AS new_bal
    FROM loyalty_accounts la
    JOIN rates r ON r.org_id = la.organization_id
   WHERE la.points_balance <> 0
     -- au moins un mouvement d'import…
     AND EXISTS (
       SELECT 1 FROM loyalty_movements m
        WHERE m.account_id = la.id AND m.source_type = 'import'
     )
     -- …et RIEN d'autre (aucune vente / avoir applicatif à préserver).
     AND NOT EXISTS (
       SELECT 1 FROM loyalty_movements m
        WHERE m.account_id = la.id AND m.source_type IS DISTINCT FROM 'import'
     )
),
ins AS (
  INSERT INTO loyalty_movements
    (organization_id, account_id, movement_type, points_delta, balance_after,
     reason, source_type)
  SELECT organization_id, account_id, 'adjust',
         (new_bal - old_bal), new_bal,
         'Régularisation import fidélité (conversion points → euros)',
         'correction'
    FROM targets
   WHERE new_bal <> old_bal
  RETURNING account_id
)
UPDATE loyalty_accounts la
   SET points_balance = t.new_bal, updated_at = now()
  FROM targets t
 WHERE la.id = t.account_id AND t.new_bal <> t.old_bal;
