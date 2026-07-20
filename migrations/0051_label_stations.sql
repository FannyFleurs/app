-- ---------------------------------------------------------------------------
-- 0051 — Stations d'impression d'étiquettes (PDA)
-- ---------------------------------------------------------------------------
-- Un PDA (appareil portable) se connecte au sous-domaine print. et est lié à
-- UNE boutique : il ne voit alors que les articles de cette boutique.
-- L'appareil s'identifie par un UUID côté client (localStorage), comme les
-- caisses (registers.device_id). Un enregistrement = 1 PDA rattaché à 1
-- boutique.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS label_stations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,               -- UUID côté client (localStorage)
  name            TEXT NOT NULL DEFAULT 'PDA',  -- nom convivial
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un appareil ne peut être rattaché qu'à une seule station par organisation.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_label_stations_device
  ON label_stations (organization_id, device_id);
CREATE INDEX IF NOT EXISTS idx_label_stations_store
  ON label_stations (store_id);

-- Row-Level Security : isolation par tenant, « fail-open si GUC absent ».
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['label_stations'] LOOP
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
