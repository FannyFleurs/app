-- Migration 0026 : liaison poste (appareil) <-> caisse.
--
-- Regle produit : "un poste = une caisse". A la premiere connexion
-- sur un appareil, l'utilisateur choisit la caisse a laquelle ce poste
-- se lie. Ensuite, ce poste utilise TOUJOURS cette caisse (pas de
-- switcher). Un autre poste ne peut pas prendre la meme caisse.
-- Pour transferer la caisse a un autre appareil (nouvel iPad, tablette
-- remplacee...), un compte Admin doit "liberer" la caisse.
--
-- Le device_id est un UUID cote client (localStorage). Le device_name
-- est libre, saisi par l'utilisateur lors du bind (ex. "iPad Comptoir").
ALTER TABLE registers
  ADD COLUMN IF NOT EXISTS device_id   TEXT,
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS bound_at    TIMESTAMPTZ;

-- Un device_id ne peut etre lie qu'a UNE seule caisse dans l'org (evite
-- que deux caisses reclament le meme poste). NULL autorises (plusieurs
-- caisses non liees).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_registers_device_id
  ON registers (organization_id, device_id)
  WHERE device_id IS NOT NULL;
