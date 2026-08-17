-- Demandes d'assistance envoyées depuis la caisse et le back-office.
--
-- Un commerçant qui bute sur un problème n'a aujourd'hui que le téléphone ou
-- l'email : la demande arrive sans contexte, sans capture, et personne ne sait
-- si elle a été traitée. Cette table lui donne un canal dans l'outil, avec
-- l'écran d'où part la demande, et un état que les deux côtés voient.
--
-- Cycle de vie :
--   nouveau  → la demande vient d'arriver, personne ne l'a ouverte
--   en_cours → prise en charge
--   traite   → résolue, avec un commentaire destiné au demandeur
--   clos     → le demandeur a lu la réponse (accusé de lecture)
--
-- La capture d'écran est stockée en data URL dans la ligne : elle est
-- compressée côté client (JPEG, 1400 px max) et plafonnée par l'API. Même
-- mécanique que la photo produit prise au PDA — pas de service de fichiers à
-- exploiter pour un usage qui se compte en dizaines de lignes par mois.
CREATE TABLE IF NOT EXISTS support_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Auteur. La demande survit à la suppression de son compte : le nom et
  -- l'email sont figés à l'envoi, pour pouvoir répondre dans tous les cas.
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name      TEXT NOT NULL DEFAULT '',
  author_email     TEXT NOT NULL DEFAULT '',
  -- Nature : panne ou souhait d'amélioration. Les deux ne se traitent pas de
  -- la même manière et ne s'attendent pas au même délai.
  kind             TEXT NOT NULL DEFAULT 'incident'
                     CHECK (kind IN ('incident', 'amelioration')),
  severity         TEXT NOT NULL DEFAULT 'gene'
                     CHECK (severity IN ('bloquant', 'gene', 'mineur')),
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL DEFAULT '',
  -- Contexte technique relevé automatiquement : l'écran d'où part la demande,
  -- l'application, le poste et le navigateur. C'est ce qui évite les allers-
  -- retours « vous étiez sur quelle page ? ».
  page_path        TEXT NOT NULL DEFAULT '',
  app_area         TEXT NOT NULL DEFAULT 'caisse',
  poste_ref        TEXT NOT NULL DEFAULT '',
  user_agent       TEXT NOT NULL DEFAULT '',
  screenshot       TEXT,
  status           TEXT NOT NULL DEFAULT 'nouveau'
                     CHECK (status IN ('nouveau', 'en_cours', 'traite', 'clos')),
  -- Note interne : visible du seul opérateur, jamais renvoyée au demandeur.
  admin_note       TEXT NOT NULL DEFAULT '',
  -- Commentaire de résolution : celui-là s'affiche chez le demandeur.
  resolution       TEXT NOT NULL DEFAULT '',
  resolved_at      TIMESTAMPTZ,
  -- Date de lecture par le demandeur : tant qu'elle est nulle et que la
  -- demande est traitée, la réponse lui est présentée à sa prochaine visite.
  acknowledged_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Liste du commerçant : ses demandes, les plus récentes d'abord.
CREATE INDEX IF NOT EXISTS support_tickets_org_idx
    ON support_tickets (organization_id, created_at DESC);

-- File de traitement de la console admin : les demandes ouvertes d'abord.
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
    ON support_tickets (status, created_at DESC);

-- Le sondage de la popup passe ici : réponses non lues d'un utilisateur.
CREATE INDEX IF NOT EXISTS support_tickets_a_lire_idx
    ON support_tickets (created_by)
 WHERE acknowledged_at IS NULL AND status IN ('traite', 'clos');

-- Row-Level Security : isolation par tenant, « fail-open si GUC absent »
-- (l'opérateur SaaS passe en bypass pour traiter les demandes de tous).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_tickets'] LOOP
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
