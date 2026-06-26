-- Audit log spécifique aux actions admin sur les abonnements
-- (extension d'essai, changement de plan, octroi de période offerte…).
-- Append-only : pas d'UPDATE/DELETE possible.

CREATE TABLE IF NOT EXISTS subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'trial_extended', 'plan_changed', 'subscription_cancelled',
    'comp_granted', 'payment_recorded', 'reactivated', 'note'
  )),
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_org
  ON subscription_events (organization_id, created_at DESC);

-- Réutilise fn_block_update_delete déjà défini en 0001
CREATE TRIGGER trg_subscription_events_no_update
  BEFORE UPDATE OR DELETE ON subscription_events
  FOR EACH ROW EXECUTE FUNCTION fn_block_update_delete();
