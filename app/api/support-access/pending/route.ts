import { NextResponse } from 'next/server';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { sweepExpired } from '@/lib/support-access/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Row { id: string; requested_at: string; request_expires_at: string; access_expires_at: string | null }

/**
 * Pour l'organisation de l'utilisateur courant (owner/manager uniquement) :
 *  - `pending` : demande de dépannage en attente d'autorisation (popup) ;
 *  - `active`  : accès de dépannage en cours (pour pouvoir y mettre fin).
 * Sert au sondage côté boutique.
 */
export async function GET() {
  const user = await readSessionFromCookie();
  const empty = { pending: null, active: null };
  if (!user) return NextResponse.json(empty);
  if (user.role !== 'owner' && user.role !== 'manager') return NextResponse.json(empty);
  try {
    await sweepExpired(user.organizationId);
    const pending = await query<Row>(
      `SELECT id, requested_at, request_expires_at, access_expires_at
         FROM support_access_requests
        WHERE organization_id = $1 AND status = 'pending' AND request_expires_at > now()
        ORDER BY requested_at DESC LIMIT 1`,
      [user.organizationId],
    );
    const active = await query<Row>(
      `SELECT id, requested_at, request_expires_at, access_expires_at
         FROM support_access_requests
        WHERE organization_id = $1 AND status = 'approved' AND started_at IS NOT NULL
          AND (access_expires_at IS NULL OR access_expires_at > now())
        ORDER BY responded_at DESC LIMIT 1`,
      [user.organizationId],
    );
    return NextResponse.json({
      pending: pending.rows[0] ?? null,
      active: active.rows[0] ?? null,
    });
  } catch {
    return NextResponse.json(empty);
  }
}
