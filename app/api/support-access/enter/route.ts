import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { sessionCookieOptions } from '@/lib/auth/session';
import { audit } from '@/lib/audit/log';
import { sha256, SUPPORT_REQUEST_COOKIE, ACCESS_TTL_MIN } from '@/lib/support-access/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Réception du passage de main (SSO) sur le back-office : valide le jeton usage
 * unique, pose le cookie de session de dépannage, puis redirige vers le BO.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  const nextParam = url.searchParams.get('next');
  const dest = nextParam && nextParam.startsWith('/') ? nextParam : '/';
  const home = new URL(dest, url.origin);

  if (!token) return NextResponse.redirect(home);

  const r = await query<{ id: string; organization_id: string; handoff_jwt: string | null }>(
    `SELECT id, organization_id, handoff_jwt
       FROM support_access_requests
      WHERE handoff_token_hash = $1 AND handoff_expires_at > now() AND status = 'approved'
      LIMIT 1`,
    [sha256(token)],
  );
  const row = r.rows[0];
  const jwt = row?.handoff_jwt;
  if (!row || !jwt) return NextResponse.redirect(home);

  // Usage unique : on invalide le jeton immédiatement.
  await query(
    `UPDATE support_access_requests
        SET handoff_token_hash = NULL, handoff_expires_at = NULL, handoff_jwt = NULL
      WHERE id = $1`,
    [row.id],
  );

  const res = NextResponse.redirect(home);
  res.cookies.set({ ...sessionCookieOptions('management'), value: jwt });
  res.cookies.set({
    name: SUPPORT_REQUEST_COOKIE,
    value: row.id,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TTL_MIN * 60,
  });

  await audit({
    organizationId: row.organization_id, userId: null,
    action: 'support.access.entered',
    entityType: 'support_access', entityId: row.id, severity: 'security',
  });

  return res;
}
