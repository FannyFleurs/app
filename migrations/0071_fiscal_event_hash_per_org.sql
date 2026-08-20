-- Unicité du hash fiscal : PAR ORGANISATION, pas globale.
--
-- La chaîne fiscale est propre à chaque organisation : `fiscal_chain_state` et
-- `immutable_index` sont par organization, et `computeEventHash` chaîne
-- previous_hash -> current_hash à l'intérieur d'une même organisation.
--
-- La contrainte historique `UNIQUE (current_hash)` était GLOBALE : deux
-- organisations distinctes qui produisent le même hash entrent en collision.
-- C'est le cas dès le 1er événement d'une organisation neuve — même
-- previous_hash de genèse, même immutable_index (1), même event_type
-- (CASH_SESSION_OPENED) et même payload (ex. deux boutiques ouvrant leur
-- première caisse avec le même fond de caisse) -> hash identique ->
-- « duplicate key value violates unique constraint fiscal_events_current_hash_key ».
--
-- On remplace donc l'unicité globale par une unicité (organization_id,
-- current_hash). L'intégrité de la chaîne reste garantie par
-- UNIQUE (organization_id, immutable_index) et par le chaînage des hash.
DO $$
DECLARE
  cname text;
BEGIN
  -- Retire TOUTE contrainte unique portant exactement sur (current_hash),
  -- quel que soit son nom auto-généré.
  SELECT c.conname INTO cname
    FROM pg_constraint c
   WHERE c.conrelid = 'fiscal_events'::regclass
     AND c.contype = 'u'
     AND (
       SELECT array_agg(a.attname::text ORDER BY a.attname::text)
         FROM unnest(c.conkey) k
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
     ) = ARRAY['current_hash']::text[]
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE fiscal_events DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'fiscal_events'::regclass
       AND conname = 'fiscal_events_org_current_hash_key'
  ) THEN
    ALTER TABLE fiscal_events
      ADD CONSTRAINT fiscal_events_org_current_hash_key
      UNIQUE (organization_id, current_hash);
  END IF;
END $$;
