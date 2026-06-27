import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { PERMISSIONS, type Permission } from '@/lib/auth/rbac';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Lit les overrides de permissions spécifiques à un utilisateur, ainsi
 * que ses permissions effectives finales (rôle + overrides org-level +
 * overrides user-level).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('users.write');
  if ('response' in g) return g.response;

  // Vérifie que l'utilisateur appartient à l'orga
  const uRes = await query<{ id: string; role: string; full_name: string }>(
    `SELECT id, role, full_name FROM users WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (uRes.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const target = uRes.rows[0]!;

  const ov = await query<{ permission: string; granted: boolean }>(
    `SELECT permission, granted FROM user_permission_overrides WHERE user_id = $1`,
    [params.id],
  ).catch(() => ({ rows: [] as Array<{ permission: string; granted: boolean }> }));

  return NextResponse.json({
    user: { id: target.id, full_name: target.full_name, role: target.role },
    overrides: ov.rows,
  });
}

const updateSchema = z.object({
  permission: z.string().min(1).max(80),
  granted: z.union([z.boolean(), z.null()]),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('users.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, updateSchema);
  if ('response' in parsed) return parsed.response;
  const { permission, granted } = parsed.data;

  if (!(permission in PERMISSIONS)) {
    return jsonError('UNKNOWN_PERMISSION', 400, { permission });
  }

  // Vérifie que l'utilisateur cible appartient bien à l'orga.
  const uRes = await query(
    `SELECT 1 FROM users WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (uRes.rowCount === 0) return jsonError('NOT_FOUND', 404);

  try {
    if (granted === null) {
      await query(
        `DELETE FROM user_permission_overrides
          WHERE user_id = $1 AND permission = $2`,
        [params.id, permission],
      );
    } else {
      await query(
        `INSERT INTO user_permission_overrides
           (user_id, permission, granted, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, permission)
         DO UPDATE SET granted = EXCLUDED.granted, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [params.id, permission, granted, g.user.id],
      );
    }
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'permissions.user.update',
      entityType: 'user', entityId: params.id,
      payload: { permission, granted: granted as boolean | null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError('INTERNAL_ERROR', 500, { message: (err as Error).message });
  }
}
