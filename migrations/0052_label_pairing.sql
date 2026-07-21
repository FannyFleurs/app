-- ---------------------------------------------------------------------------
-- 0052 — Appairage des PDA (app étiquettes dédiée)
-- ---------------------------------------------------------------------------
-- L'app PDA (pda.) est indépendante de la caisse : elle se connecte par
-- appairage. En BO on génère un code par boutique (saisi ou scanné en QR sur
-- le PDA). L'appairage rattache l'appareil à la boutique et ouvre une session
-- longue durée pour un utilisateur de service dédié à cette boutique.
-- ---------------------------------------------------------------------------

-- Utilisateur de service (PDA) : masqué des écrans de connexion par tuile.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT FALSE;

-- Un code d'appairage courant par boutique + son utilisateur de service.
CREATE TABLE IF NOT EXISTS label_pairings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,               -- code d'appairage courant
  service_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule ligne d'appairage par boutique ; recherche rapide par code.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_label_pairings_store
  ON label_pairings (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_label_pairings_code
  ON label_pairings (organization_id, code);

-- Row-Level Security : isolation par tenant, « fail-open si GUC absent ».
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['label_pairings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
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
    $f$, t);
  END LOOP;
END $$;
