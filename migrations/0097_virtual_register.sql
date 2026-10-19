-- Caisse virtuelle : un poste spécial, jamais lié à un appareil physique,
-- réservé à l'encaissement automatique des commandes WEB/OGF (voir
-- lib/services/virtual-register.ts). Sa session de caisse reste en
-- permanence ouverte et n'est jamais fermée par la clôture du soir.
ALTER TABLE registers
  ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN NOT NULL DEFAULT FALSE;
