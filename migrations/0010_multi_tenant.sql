-- Passage en multi-tenant SaaS : chaque client crée son organisation,
-- plusieurs orgs cohabitent dans la même base.
--
-- 1. Slug unique pour identifier le tenant (URL, sous-domaine, etc.)
-- 2. Plan d'abonnement + date de fin d'essai
-- 3. Email unique GLOBAL (impossible d'avoir 2 admins avec le même email
--    sur des tenants différents, sinon ambiguïté à la connexion).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Slug unique pour celles qui en ont
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_slug
  ON organizations (slug) WHERE slug IS NOT NULL;

-- Email globalement unique (était unique par organisation seulement)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE indexname = 'uq_users_email_global'
  ) THEN
    CREATE UNIQUE INDEX uq_users_email_global ON users (lower(email));
  END IF;
EXCEPTION WHEN unique_violation THEN
  -- index already partially exists or doublons — on log et continue
  RAISE NOTICE 'uq_users_email_global non créé (doublons existants ?)';
END $$;

-- Suivi d'abonnement (basique pour V1, extensible Stripe ensuite).
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL DEFAULT 'trial'
                  CHECK (plan IN ('trial','starter','pro','enterprise','cancelled')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','past_due','cancelled','expired')),
  -- Période de facturation courante
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  -- Référence externe (ex : Stripe subscription id) — facultatif
  external_ref    TEXT,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (status);
