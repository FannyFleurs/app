-- Demandes de démo / contact envoyées depuis le site vitrine (hellopos.fr).
-- Niveau plateforme (aucune organisation) : consultées par le super-admin
-- dans la console admin. Le formulaire public écrit ici et déclenche une
-- notification email vers l'adresse de contact de la plateforme.
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  shop        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'site',
  handled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_created_idx
  ON contact_messages (created_at DESC);
