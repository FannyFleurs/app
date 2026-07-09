-- Migration 0029 : configuration globale de la plateforme HelloPos.
--
-- Contrairement a la table `settings` (scopee par organisation tenant),
-- ceci stocke la config de l'EDITEUR (HelloPos) : logo, identite de la
-- societe, coordonnees affichees sur le site vitrine. Une seule ligne
-- (singleton) editee uniquement par le super_admin.
CREATE TABLE IF NOT EXISTS platform_settings (
    id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    value       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES users(id)
);

-- Ligne unique initiale.
INSERT INTO platform_settings (id, value)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
