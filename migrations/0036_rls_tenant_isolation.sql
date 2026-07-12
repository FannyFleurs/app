-- ---------------------------------------------------------------------------
-- 0036 — Row-Level Security : isolation stricte par organisation (tenant)
-- ---------------------------------------------------------------------------
-- Filet de sécurité « défense en profondeur » : même une requête qui
-- oublierait le filtre `organization_id` ne pourra PAS voir/écrire les
-- données d'un autre tenant.
--
-- Mécanique : chaque requête applicative pose (transaction-local) le GUC
--   app.current_org = <organization_id>.
-- La politique n'autorise que les lignes de cette org.
--
-- FAIL-OPEN volontaire : si le GUC n'est pas posé (auth, webhooks, endpoints
-- publics, super-admin, ou RLS_ENFORCE désactivé côté app), l'accès reste
-- complet — de sorte que l'activation soit progressive et ne casse rien.
-- L'application ne pose le GUC que si RLS_ENFORCE=1.
--
-- FORCE ROW LEVEL SECURITY : la politique s'applique AUSSI au propriétaire
-- des tables (le rôle de connexion Neon), sinon la RLS serait contournée.
-- ---------------------------------------------------------------------------

-- Toutes les tables qui portent une colonne organization_id.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND a.attname = 'organization_id'
       AND NOT a.attisdropped
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.tbl);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        USING (
          current_setting('app.current_org', true) IS NULL
          OR current_setting('app.current_org', true) = ''
          OR organization_id::text = current_setting('app.current_org', true)
        )
        WITH CHECK (
          current_setting('app.current_org', true) IS NULL
          OR current_setting('app.current_org', true) = ''
          OR organization_id::text = current_setting('app.current_org', true)
        )
    $f$, r.tbl);
  END LOOP;
END $$;

-- La table organizations elle-même est clé par `id` (pas organization_id).
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.organizations;
CREATE POLICY tenant_isolation ON public.organizations
  USING (
    current_setting('app.current_org', true) IS NULL
    OR current_setting('app.current_org', true) = ''
    OR id::text = current_setting('app.current_org', true)
  )
  WITH CHECK (
    current_setting('app.current_org', true) IS NULL
    OR current_setting('app.current_org', true) = ''
    OR id::text = current_setting('app.current_org', true)
  );
