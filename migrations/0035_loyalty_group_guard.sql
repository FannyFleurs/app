-- ---------------------------------------------------------------------------
-- 0035 — Filet de sécurité pour la fidélité segmentée (0034)
-- ---------------------------------------------------------------------------
-- Garantit qu'aucune contrainte UNIQUE portant UNIQUEMENT sur customer_id ne
-- subsiste sur loyalty_accounts (sinon un client ne pourrait pas avoir un
-- compte par groupe). On la supprime par sa forme (et non par son nom, qui
-- pourrait varier), puis on s'assure de l'unicité (customer_id, group_key).
-- Idempotent : ne fait rien si tout est déjà en place.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  cust_attnum smallint;
BEGIN
  SELECT attnum INTO cust_attnum
    FROM pg_attribute
   WHERE attrelid = 'loyalty_accounts'::regclass
     AND attname = 'customer_id'
     AND NOT attisdropped;

  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'loyalty_accounts'::regclass
       AND contype = 'u'
       AND array_length(conkey, 1) = 1
       AND conkey[1] = cust_attnum
  LOOP
    EXECUTE format('ALTER TABLE loyalty_accounts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_accounts_customer_group_uk
  ON loyalty_accounts (customer_id, group_key);
