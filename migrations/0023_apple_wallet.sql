-- Migration 0023 : Apple Wallet loyalty passes.
--
-- wallet_passes : une ligne par (client × programme). Contient le serial
-- number unique du pass et le authenticationToken utilise par Apple pour
-- authentifier les appels au web service.
--
-- wallet_devices : chaque iPhone qui a enregistre ce pass. Apple nous
-- appelle pour s'enregistrer/desenregistrer et nous donne un pushToken
-- utilise pour declencher la mise a jour automatique via APNs.

CREATE TABLE IF NOT EXISTS wallet_passes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('apple','google')),
  serial_number         TEXT NOT NULL,
  authentication_token  TEXT NOT NULL,
  pass_type_id          TEXT NOT NULL,
  last_pushed_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_customer
  ON wallet_passes (customer_id, provider);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_updated
  ON wallet_passes (organization_id, updated_at);

CREATE TABLE IF NOT EXISTS wallet_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id           UUID NOT NULL REFERENCES wallet_passes(id) ON DELETE CASCADE,
  device_library_id TEXT NOT NULL,
  push_token        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pass_id, device_library_id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_devices_pass
  ON wallet_devices (pass_id);
