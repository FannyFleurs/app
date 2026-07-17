-- ---------------------------------------------------------------------------
-- 0049 — Impression directe Star CloudPRNT (imprimante étiquettes)
-- ---------------------------------------------------------------------------
-- Modèle « pull » : l'imprimante (Ethernet) interroge périodiquement notre
-- serveur en HTTPS sortant, récupère les jobs en attente, puis confirme.
-- Deux tables : les imprimantes enregistrées + la file d'attente des jobs.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cloudprnt_printers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id        UUID REFERENCES stores(id) ON DELETE SET NULL,
  mac             TEXT NOT NULL,               -- identifiant unique (MAC), normalisé
  label           TEXT NOT NULL,               -- nom convivial
  role            TEXT NOT NULL DEFAULT 'label' -- 'label' | 'receipt'
                    CHECK (role IN ('label', 'receipt')),
  poll_token      TEXT,                        -- secret optionnel (dans l'URL de poll)
  poll_interval   INTEGER NOT NULL DEFAULT 5,  -- secondes (indicatif, réglé sur l'imprimante)
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at    TIMESTAMPTZ,
  last_status     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, mac)
);

CREATE TABLE IF NOT EXISTS cloudprnt_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  printer_id      UUID NOT NULL REFERENCES cloudprnt_printers(id) ON DELETE CASCADE,
  token           TEXT NOT NULL,               -- jeton du job (renvoyé au GET/DELETE)
  content_type    TEXT NOT NULL,               -- ex 'text/vnd.star.markup'
  payload         BYTEA NOT NULL,              -- contenu du job
  title           TEXT,                        -- description humaine (ex "12 étiquettes")
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'printing', 'done', 'error', 'cancelled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cloudprnt_jobs_queue
  ON cloudprnt_jobs (printer_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_cloudprnt_jobs_token
  ON cloudprnt_jobs (token);

-- Row-Level Security : même politique « fail-open si GUC absent » que 0036,
-- pour que l'endpoint public (imprimante, sans contexte tenant) fonctionne,
-- tout en isolant les requêtes applicatives (app.current_org posé).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cloudprnt_printers', 'cloudprnt_jobs'] LOOP
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
