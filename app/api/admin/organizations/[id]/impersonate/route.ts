import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { decodeJwt } from 'jose';
import { query } from '@/lib/db/client';
import { audit } from '@/lib/audit/log';
import { createSession } from '@/lib/auth/session';
import { spaceUrls } from '@/lib/site/spaces';
import {
  requireSuperAdmin, sweepExpired, findImpersonationTarget, sha256, HANDOFF_TTL_S,
} from '@/lib/support-access/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Ouvre une session de dépannage pour l'organisation cible, à condition qu'une
 * demande ait été AUTORISÉE par la boutique et non expirée. Renvoie une URL de
 * passage de main (jeton usage unique) vers le back-office de la boutique.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  await sweepExpired(params.id);

  const req = await query<{ id: string; access_expires_at: string | null }>(
    `SELECT id, access_expires_at FROM support_access_requests
      WHERE organization_id = $1 AND status = 'approved'
        AND (access_expires_at IS NULL OR access_expires_at > now())
      ORDER BY responded_at DESC NULLS LAST
      LIMIT 1`,
    [params.id],
  );
  if (req.rowCount === 0) return NextResponse.json({ error: 'NO_CONSENT' }, { status: 403 });
  const request = req.rows[0]!;

  const target = await findImpersonationTarget(params.id);
  if (!target) return NextResponse.json({ error: 'NO_TARGET' }, { status: 400 });

  // Fenêtre restante, plafonnée à 2 h par access_expires_at.
  const remainingMin = request.access_expires_at
    ? Math.max(1, Math.ceil((new Date(request.access_expires_at).getTime() - Date.now()) / 60000))
    : 120;

  const jwt = await createSession({
    userId: target.id,
    organizationId: params.id,
    role: target.role,
    kind: 'management',
    ttlMinutesOverride: remainingMin,
  });
  const sessionId = String((decodeJwt(jwt) as { jti?: string }).jti ?? '');

  const handoff = randomBytes(24).toString('hex');
  await query(
    `UPDATE support_access_requests
        SET started_at = now(), impersonated_user_id = $2, impersonation_session_id = $3,
            handoff_token_hash = $4,
            handoff_expires_at = now() + ($5::int * interval '1 second'),
            handoff_jwt = $6
      WHERE id = $1`,
    [request.id, target.id, sessionId, sha256(handoff), HANDOFF_TTL_S, jwt],
  );

  await audit({
    organizationId: params.id, userId: g.user.id,
    action: 'support.access.started',
    entityType: 'support_access', entityId: request.id,
    payload: { impersonated_user_id: target.id }, severity: 'security',
  });

  const urls = spaceUrls(headers().get('host'));
  const enter = urls.preview
    ? `/api/support-access/enter?t=${handoff}&next=${encodeURIComponent(urls.bo)}`
    : `${urls.bo}/api/support-access/enter?t=${handoff}`;

  return NextResponse.json({ ok: true, redirect: enter });
}
