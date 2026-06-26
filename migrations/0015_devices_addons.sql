-- Limite multi-appareils par organisation + addons activés
-- max_devices : nombre maximum de sessions actives simultanées
--   par défaut = 1 (un seul iPad par boutique)
-- addons : JSONB libre pour activer des options ("multi_device": true, etc.)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_devices INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '{}'::jsonb;
