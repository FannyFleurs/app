import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { readSessionFromCookie } from '@/lib/auth/session';
import { jsonError } from '@/lib/validation/api';
import { query } from '@/lib/db/client';

export type AuthUser = NonNullable<Awaited<ReturnType<typeof readSessionFromCookie>>>;

/** Délai laissé à la boutique pour répondre à une demande (minutes). */
export const REQUEST_TTL_MIN = 10;
/** Fenêtre d'accès accordée après autorisation (minutes). */
export const ACCESS_TTL_MIN = 120; // 2 h max

/** Cookie liant la session de dépannage courante à sa demande (sur le BO). */
export const SUPPORT_REQUEST_COOKIE = 'webpos_support_request';

/** Durée de validité du jeton de passage de main admin -> BO (secondes). */
export const HANDOFF_TTL_S = 60;

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Garde : réservé au super_admin (opérateur HelloPos). */
export async function requireSuperAdmin(): Promise<{ user: AuthUser } | { response: NextResponse }> {
  const user = await readSessionFromCookie();
  if (!user) return { response: jsonError('UNAUTHORIZED', 401) };
  if (user.role !== 'super_admin') return { response: jsonError('FORBIDDEN', 403) };
  return { user };
}

/**
 * Choisit l'utilisateur à « incarner » pour dépanner une organisation :
 * l'owner en priorité, sinon un manager. C'est le compte qui donne les droits
 * de correction (réglages, comptes, imprimantes).
 */
export async function findImpersonationTarget(organizationId: string): Promise<{ id: string; role: 'owner' | 'manager' } | null> {
  const r = await query<{ id: string; role: 'owner' | 'manager' }>(
    `SELECT id, role FROM users
      WHERE organization_id = $1 AND is_active = TRUE
        AND role IN ('owner','manager')
      ORDER BY (role = 'owner') DESC, created_at ASC
      LIMIT 1`,
    [organizationId],
  );
  return r.rows[0] ?? null;
}

/** Demande de dépannage active (en attente ou accordée non expirée) pour une org. */
export interface SupportRequestRow {
  id: string;
  organization_id: string;
  status: string;
  requested_at: string;
  request_expires_at: string;
  responded_at: string | null;
  access_expires_at: string | null;
  impersonation_session_id: string | null;
}

/**
 * Marque comme « expirées » les demandes en attente dont le délai de réponse
 * est dépassé, et « ended » les accès dont la fenêtre est écoulée. Idempotent.
 */
export async function sweepExpired(organizationId?: string): Promise<void> {
  const scope = organizationId ? 'AND organization_id = $1' : '';
  const params = organizationId ? [organizationId] : [];
  try {
    await query(
      `UPDATE support_access_requests
          SET status = 'expired'
        WHERE status = 'pending' AND request_expires_at < now() ${scope}`,
      params,
    );
    await query(
      `UPDATE support_access_requests
          SET status = 'ended', ended_at = now()
        WHERE status = 'approved' AND access_expires_at IS NOT NULL
          AND access_expires_at < now() ${scope}`,
      params,
    );
  } catch { /* table 0072 absente : ignore */ }
}
