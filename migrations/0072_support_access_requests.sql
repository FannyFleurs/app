-- Accès de dépannage (support) avec consentement de la boutique.
--
-- Un super_admin demande un accès à une organisation ; un owner/manager de
-- cette organisation doit l'AUTORISER (popup) avant que l'accès ne s'ouvre.
-- L'accès prend la forme d'une impersonation de l'owner, limitée dans le temps
-- (fenêtre de 2 h), révocable par la boutique, et intégralement journalisée.
CREATE TABLE IF NOT EXISTS support_access_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- super_admin
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','declined','expired','ended','revoked')),
  reason                    text,
  requested_at              timestamptz NOT NULL DEFAULT now(),
  request_expires_at        timestamptz NOT NULL,     -- délai de réponse (10 min)
  responded_at              timestamptz,
  responded_by              uuid REFERENCES users(id) ON DELETE SET NULL,  -- owner/manager
  access_expires_at         timestamptz,              -- fin de la fenêtre d'accès (2 h)
  impersonated_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  impersonation_session_id  uuid,
  started_at                timestamptz,
  ended_at                  timestamptz,
  -- Passage de main (SSO) admin -> sous-domaine BO : jeton à usage unique
  -- (courte durée) qui transporte la session d'impersonation d'un sous-domaine
  -- à l'autre sans exposer le JWT dans l'URL.
  handoff_token_hash        text,
  handoff_expires_at        timestamptz,
  handoff_jwt               text
);

CREATE INDEX IF NOT EXISTS idx_support_access_org_status
  ON support_access_requests (organization_id, status);
