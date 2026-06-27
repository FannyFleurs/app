import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Révoque une session précise d'une organisation (libère une place
 * multi-appareils). Vérifie que la session appartient bien à un user
 * de l'organisation ciblée — sécurité super_admin oblige.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string; sid: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  // S'assure que la session appartient à l'organisation
  const check = await query<{ user_email: string }>(
    `SELECT u.email AS user_email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND u.organization_id = $2
        AND s.revoked_at IS NULL`,
    [params.sid, params.id],
  );
  if (check.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await query(
    `UPDATE sessions SET revoked_at = now() WHERE id = $1`,
    [params.sid],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'admin.session.revoke',
    entityType: 'session', entityId: params.sid,
    payload: { target_org: params.id, target_email: check.rows[0]!.user_email },
  });

  return NextResponse.json({ ok: true });
}
