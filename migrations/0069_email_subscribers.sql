-- Adresses collectées via le formulaire d'inscription du site vitrine
-- (bas de page). Simple opt-in : une adresse, une source, une date.
-- Niveau plateforme (aucune organisation) ; consultable par le super-admin.
CREATE TABLE IF NOT EXISTS email_subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL DEFAULT 'site',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
