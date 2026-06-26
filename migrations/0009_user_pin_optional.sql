-- Permet d'autoriser la connexion sans PIN sur la touche utilisateur
-- (utile pour kiosque/atelier où l'inalterabilité est garantie par les autres
--  flux : audit logs + fiscal hash chain).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_required BOOLEAN NOT NULL DEFAULT TRUE;
