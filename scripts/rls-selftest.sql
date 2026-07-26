-- ---------------------------------------------------------------------------
-- Auto-test d'isolation multi-tenant (Row-Level Security).
--
-- Prouve que la RLS (migration 0036) isole réellement les données par
-- organisation. À lancer sur une base JETABLE (jamais la prod) qui a reçu
-- toutes les migrations :
--
--   createdb rlstest
--   DATABASE_URL=postgres://.../rlstest npx tsx scripts/migrate.ts
--   psql "postgres://.../rlstest" -f scripts/rls-selftest.sql
--
-- IMPORTANT : les assertions tournent sous `SET ROLE app_role` (rôle
-- NON-superuser). Un superuser Postgres CONTOURNE toujours la RLS ; le test
-- serait donc faussement « vert » sans ce SET ROLE. En production, le rôle de
-- connexion Neon n'est pas superuser : la RLS s'applique donc bien.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

DROP ROLE IF EXISTS app_role;
CREATE ROLE app_role NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;

DO $$
DECLARE
  orgA uuid;
  orgB uuid;
  n int;
  ok boolean;
BEGIN
  -- Amorçage en superuser (RLS contournée) : 2 tenants + 1 réglage chacun.
  INSERT INTO organizations (name, legal_name) VALUES ('Tenant A','A SARL') RETURNING id INTO orgA;
  INSERT INTO organizations (name, legal_name) VALUES ('Tenant B','B SARL') RETURNING id INTO orgB;
  INSERT INTO settings (organization_id, key, value) VALUES (orgA, 'k', '"vA"');
  INSERT INTO settings (organization_id, key, value) VALUES (orgB, 'k', '"vB"');

  -- On bascule sur le rôle applicatif NON-superuser : la RLS s'applique.
  SET LOCAL ROLE app_role;

  -- TEST 1 — GUC vide (auth/webhook/super-admin) => fail-open, tout visible.
  PERFORM set_config('app.current_org', '', true);
  SELECT count(*) INTO n FROM settings WHERE key='k';
  IF n <> 2 THEN RAISE EXCEPTION 'TEST 1 ÉCHEC : fail-open devrait voir 2, vu %', n; END IF;
  RAISE NOTICE 'TEST 1 OK  — GUC vide : accès complet (% lignes)', n;

  -- TEST 2 — isolation en lecture : org A ne voit que sa ligne.
  PERFORM set_config('app.current_org', orgA::text, true);
  SELECT count(*) INTO n FROM settings WHERE key='k';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 2 ÉCHEC : org A devrait voir 1, vu %', n; END IF;
  SELECT count(*) INTO n FROM settings WHERE organization_id = orgB;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 2 ÉCHEC : org A voit % ligne(s) de B', n; END IF;
  RAISE NOTICE 'TEST 2 OK  — org A isolée en lecture (voit la sienne, rien de B)';

  -- TEST 3 — UPDATE cross-tenant = 0 ligne touchée.
  UPDATE settings SET value='"hack"' WHERE organization_id = orgB;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 3 ÉCHEC : org A a modifié % ligne(s) de B', n; END IF;
  RAISE NOTICE 'TEST 3 OK  — org A ne peut pas modifier les données de B';

  -- TEST 4 — WITH CHECK : insérer au nom de B en étant A doit échouer.
  ok := false;
  BEGIN
    INSERT INTO settings (organization_id, key, value) VALUES (orgB, 'k2', '"x"');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'TEST 4 ÉCHEC : org A a inséré une ligne pour B'; END IF;
  RAISE NOTICE 'TEST 4 OK  — org A ne peut pas insérer au nom de B (WITH CHECK)';

  -- TEST 5 — accès légitime : org A lit/écrit SES données.
  INSERT INTO settings (organization_id, key, value) VALUES (orgA, 'k3', '"mine"');
  SELECT count(*) INTO n FROM settings WHERE organization_id = orgA;
  IF n <> 2 THEN RAISE EXCEPTION 'TEST 5 ÉCHEC : org A devrait avoir 2, vu %', n; END IF;
  RAISE NOTICE 'TEST 5 OK  — org A accède normalement à SES données';

  -- TEST 6 — table organizations (clé = id) également isolée.
  SELECT count(*) INTO n FROM organizations;
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 6 ÉCHEC : org A devrait voir 1 organisation, vu %', n; END IF;
  RAISE NOTICE 'TEST 6 OK  — table organizations isolée';

  RESET ROLE;
  RAISE NOTICE '==== TOUS LES TESTS RLS SONT PASSÉS ====';
END $$;

-- Nettoyage : retire d'abord les privilèges/objets liés au rôle, puis le rôle.
DROP OWNED BY app_role;
DROP ROLE IF EXISTS app_role;
