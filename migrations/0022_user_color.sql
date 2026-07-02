-- Migration 0022 : couleur d'etiquette utilisateur.
-- Ajoute une colonne "color" sur users pour permettre a chaque
-- utilisateur (via l'admin) de choisir la couleur de sa pastille /
-- avatar sur l'ecran de connexion. Format #RRGGBB en majuscules.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS color TEXT
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
