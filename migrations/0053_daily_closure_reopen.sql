-- Réouverture de journée : permettre PLUSIEURS clôtures pour une même
-- (boutique, date d'opération). Après une clôture, si le poste est rouvert et
-- que de nouvelles ventes sont encaissées, on doit pouvoir recompter et
-- reclôturer. Chaque clôture reste immuable (trigger append-only) et scelle
-- une PÉRIODE distincte (bornée par la clôture précédente), chaînée par le hash
-- fiscal. On numérote les clôtures d'une même journée par `seq`.

ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS seq INT NOT NULL DEFAULT 1;
-- Début de période couverte par la clôture (= sealed_at de la clôture
-- précédente de la même journée ; NULL pour la première).
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ;

-- Remplace l'unicité (store_id, business_date) par (store_id, business_date, seq).
-- On retire d'abord TOUTE contrainte unique portant exactement sur
-- (store_id, business_date), quel que soit son nom auto-généré.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
    FROM pg_constraint c
   WHERE c.conrelid = 'daily_closures'::regclass
     AND c.contype = 'u'
     AND (
       SELECT array_agg(a.attname ORDER BY a.attname)
         FROM unnest(c.conkey) k
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
     ) = ARRAY['business_date','store_id']
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE daily_closures DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'daily_closures'::regclass
       AND conname = 'daily_closures_store_date_seq_key'
  ) THEN
    ALTER TABLE daily_closures
      ADD CONSTRAINT daily_closures_store_date_seq_key
      UNIQUE (store_id, business_date, seq);
  END IF;
END $$;
