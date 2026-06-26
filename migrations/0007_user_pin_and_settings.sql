-- Ajoute un code PIN à 4 chiffres (hashé bcrypt) pour la connexion rapide.
-- Le mot de passe email/password reste utilisable pour l'admin si renseigné.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS auto_logout_minutes INT;
