import { NextResponse } from 'next/server';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * La boutique met fin à un accès de dépannage en cours (ou en attente).
 * Révoque immédiatement la session d'impersonation : l'opérateur est déconnecté.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await readSessionFromCookie();
  if (!user) return jsonError('UNAUTHORIZED', 401);
  if (user.role !== 'owner' && user.role !== 'manager') return jsonError('FORBIDDEN', 403);

  const r = await query<{ id: string; impersonation_session_id: string | null }>(
    `SELECT id, impersonation_session_id FROM support_access_requests
      WHERE id = $1 AND organization_id = $2
        AND status IN ('pending', 'approved')
      FOR UPDATE`,
    [params.id, user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('REQUEST_NOT_ACTIVE', 409);

  await query(
    `UPDATE support_access_requests
        SET status = 'revoked', ended_at = now()
      WHERE id = $1`,
    [params.id],
  );

  // Coupe la session de dépannage si elle est ouverte.
  const sid = r.rows[0]!.impersonation_session_id;
  if (sid) {
    await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sid]);
  }

  await audit({
    organizationId: user.organizationId, userId: user.id,
    action: 'support.access.revoked',
    entityType: 'support_access', entityId: params.id,
    severity: 'security',
  });

  return NextResponse.json({ ok: true });
}
