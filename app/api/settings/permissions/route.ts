import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { PERMISSIONS, ROLES, type Permission, type Role } from '@/lib/auth/rbac';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Lit la matrice complète "rôle → permission → granted" pour cette
 * organisation. Renvoie pour chaque (role, permission) :
 *  - la valeur par défaut (codée dans rbac.ts)
 *  - l'éventuel override d'organisation
 *
 * Le client peut ensuite afficher des toggles 3 états (défaut / activé /
 * révoqué).
 */
export async function GET() {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const overrides = await query<{ role: string; permission: string; granted: boolean }>(
    `SELECT role, permission, granted FROM role_permissions_overrides
       WHERE organization_id = $1`,
    [g.user.organizationId],
  ).catch(() => ({ rows: [] as Array<{ role: string; permission: string; granted: boolean }> }));

  // Pour chaque rôle assignable, on retourne la liste des permissions
  // avec leur défaut + override.
  const matrix: Array<{
    role: string;
    permissions: Array<{ permission: string; default: boolean; override: boolean | null }>;
  }> = [];

  for (const role of ROLES) {
    if (role === 'super_admin') continue; // jamais éditable, accès total
    const perms = (Object.keys(PERMISSIONS) as Permission[]).map((p) => {
      const isDefault = (PERMISSIONS[p] as readonly Role[]).includes(role as Role);
      const ov = overrides.rows.find((o) => o.role === role && o.permission === p);
      return { permission: p, default: isDefault, override: ov ? ov.granted : null };
    });
    matrix.push({ role, permissions: perms });
  }

  return NextResponse.json({ matrix });
}

/**
 * Met à jour un override : grant / revoke / clear.
 * Body : { role, permission, granted: true | false | null }
 *   - true  : permission accordée (override granted)
 *   - false : permission révoquée (override denied)
 *   - null  : pas d'override (retourne au défaut du rôle)
 */
const updateSchema = z.object({
  role: z.enum(ROLES.filter((r) => r !== 'super_admin') as ['owner', 'manager', 'vendeur', 'comptable', 'lecture_seule', 'support_technique']),
  permission: z.string().min(1).max(80),
  granted: z.union([z.boolean(), z.null()]),
});

export async function PUT(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, updateSchema);
  if ('response' in parsed) return parsed.response;
  const { role, permission, granted } = parsed.data;

  // Validation : la permission doit exister dans la table connue
  if (!(permission in PERMISSIONS)) {
    return jsonError('UNKNOWN_PERMISSION', 400, { permission });
  }

  try {
    if (granted === null) {
      await query(
        `DELETE FROM role_permissions_overrides
          WHERE organization_id = $1 AND role = $2 AND permission = $3`,
        [g.user.organizationId, role, permission],
      );
    } else {
      await query(
        `INSERT INTO role_permissions_overrides
           (organization_id, role, permission, granted, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (organization_id, role, permission)
         DO UPDATE SET granted = EXCLUDED.granted, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [g.user.organizationId, role, permission, granted, g.user.id],
      );
    }
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'permissions.role.update',
      entityType: 'role', entityId: role,
      payload: { role, permission, granted },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError('INTERNAL_ERROR', 500, { message: (err as Error).message });
  }
}
