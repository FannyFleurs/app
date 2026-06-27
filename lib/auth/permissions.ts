import { query } from '@/lib/db/client';
import { PERMISSIONS, type Permission, type Role } from './rbac';

/**
 * Permissions effectives d'un utilisateur, en tenant compte :
 *   1. des permissions par défaut du rôle (lib/auth/rbac.ts)
 *   2. des overrides au niveau de l'organisation pour ce rôle
 *      (role_permissions_overrides — migration 0017)
 *   3. des overrides spécifiques à cet utilisateur
 *      (user_permission_overrides — migration 0017)
 *
 * `super_admin` court-circuite toujours : accès total cross-orga.
 */
export async function resolveEffectivePermissions(
  userId: string,
  role: Role,
  organizationId: string,
): Promise<Set<Permission>> {
  const result = new Set<Permission>();

  if (role === 'super_admin') {
    // Toutes les permissions connues
    for (const k of Object.keys(PERMISSIONS)) result.add(k as Permission);
    return result;
  }

  // 1. Défauts du rôle
  for (const [perm, roles] of Object.entries(PERMISSIONS)) {
    if ((roles as readonly Role[]).includes(role)) result.add(perm as Permission);
  }

  // 2. Overrides au niveau organisation pour ce rôle
  try {
    const r = await query<{ permission: string; granted: boolean }>(
      `SELECT permission, granted FROM role_permissions_overrides
        WHERE organization_id = $1 AND role = $2`,
      [organizationId, role],
    );
    for (const row of r.rows) {
      if (row.granted) result.add(row.permission as Permission);
      else result.delete(row.permission as Permission);
    }
  } catch {
    // Migration 0017 pas encore appliquée : on continue silencieusement.
  }

  // 3. Overrides spécifiques à l'utilisateur
  try {
    const r = await query<{ permission: string; granted: boolean }>(
      `SELECT permission, granted FROM user_permission_overrides WHERE user_id = $1`,
      [userId],
    );
    for (const row of r.rows) {
      if (row.granted) result.add(row.permission as Permission);
      else result.delete(row.permission as Permission);
    }
  } catch {
    // Migration 0017 pas encore appliquée
  }

  return result;
}

export async function hasEffectivePermission(
  userId: string,
  role: Role,
  organizationId: string,
  perm: Permission,
): Promise<boolean> {
  const set = await resolveEffectivePermissions(userId, role, organizationId);
  return set.has(perm);
}
