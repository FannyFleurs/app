-- Permissions personnalisables par organisation :
-- - role_permissions_overrides : override d'un rôle pour TOUTE l'organisation
--   (exemple : "dans cette boutique, les vendeurs peuvent voir la stock")
-- - user_permission_overrides : override pour UN utilisateur précis, indépendant
--   du rôle (exemple : "ce vendeur a accès à la stock même si son rôle ne l'a pas")
--
-- Chaque ligne : granted = true → octroyé / false → retiré. Si la ligne
-- n'existe pas, on tombe sur le défaut codé dans lib/auth/rbac.ts.

CREATE TABLE IF NOT EXISTS role_permissions_overrides (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission text NOT NULL,
  granted boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, role, permission)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_perm_override_org
  ON role_permissions_overrides(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_perm_override_user
  ON user_permission_overrides(user_id);
