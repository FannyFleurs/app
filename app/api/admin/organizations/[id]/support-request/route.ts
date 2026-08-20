import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { requireSuperAdmin, sweepExpired, REQUEST_TTL_MIN } from '@/lib/support-access/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RequestView {
  id: string; status: string;
  requested_at: string; request_expires_at: string;
  responded_at: string | null; access_expires_at: string | null;
}

async function activeRequest(orgId: string): Promise<RequestView | null> {
  const r = await query<RequestView>(
    `SELECT id, status, requested_at, request_expires_at, responded_at, access_expires_at
       FROM support_access_requests
      WHERE organization_id = $1
        AND (status = 'pending'
             OR (status = 'approved' AND (access_expires_at IS NULL OR access_expires_at > now())))
      ORDER BY requested_at DESC
      LIMIT 1`,
    [orgId],
  );
  return r.rows[0] ?? null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  await sweepExpired(params.id);
  return NextResponse.json({ request: await activeRequest(params.id) });
}

const schema = z.object({ reason: z.string().max(300).optional() }).optional();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  await sweepExpired(params.id);

  const org = await query<{ id: string; name: string }>(
    `SELECT id, name FROM organizations WHERE id = $1`, [params.id],
  );
  if (org.rowCount === 0) return NextResponse.json({ error: 'ORG_NOT_FOUND' }, { status: 404 });

  // Une seule demande active à la fois (en attente ou accès en cours).
  const existing = await activeRequest(params.id);
  if (existing) return NextResponse.json({ request: existing, existing: true });

  const ins = await query<RequestView>(
    `INSERT INTO support_access_requests (organization_id, requested_by, reason, request_expires_at)
     VALUES ($1, $2, $3, now() + ($4::int * interval '1 minute'))
     RETURNING id, status, requested_at, request_expires_at, responded_at, access_expires_at`,
    [params.id, g.user.id, parsed.data?.reason ?? null, REQUEST_TTL_MIN],
  );

  await audit({
    organizationId: params.id, userId: g.user.id,
    action: 'support.access.requested',
    entityType: 'support_access', entityId: ins.rows[0]!.id,
    payload: { org: org.rows[0]!.name }, severity: 'security',
  });

  return NextResponse.json({ request: ins.rows[0] });
}
