import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { ACCESS_TTL_MIN } from '@/lib/support-access/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ action: z.enum(['approve', 'decline']) });

/** La boutique (owner/manager) autorise ou refuse une demande de dépannage. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await readSessionFromCookie();
  if (!user) return jsonError('UNAUTHORIZED', 401);
  if (user.role !== 'owner' && user.role !== 'manager') return jsonError('FORBIDDEN', 403);

  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  // La demande doit appartenir à l'organisation de l'utilisateur, être en
  // attente et non expirée.
  const r = await query<{ id: string; status: string }>(
    `SELECT id, status FROM support_access_requests
      WHERE id = $1 AND organization_id = $2 AND status = 'pending'
        AND request_expires_at > now()
      FOR UPDATE`,
    [params.id, user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('REQUEST_NOT_PENDING', 409);

  if (parsed.data.action === 'approve') {
    await query(
      `UPDATE support_access_requests
          SET status = 'approved', responded_at = now(), responded_by = $2,
              access_expires_at = now() + ($3::int * interval '1 minute')
        WHERE id = $1`,
      [params.id, user.id, ACCESS_TTL_MIN],
    );
  } else {
    await query(
      `UPDATE support_access_requests
          SET status = 'declined', responded_at = now(), responded_by = $2
        WHERE id = $1`,
      [params.id, user.id],
    );
  }

  await audit({
    organizationId: user.organizationId, userId: user.id,
    action: parsed.data.action === 'approve' ? 'support.access.approved' : 'support.access.declined',
    entityType: 'support_access', entityId: params.id,
    severity: 'security',
  });

  return NextResponse.json({ ok: true });
}
