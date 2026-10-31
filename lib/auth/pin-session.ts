import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db/client';
import { createSession, sessionCookieOptions, DeviceLimitError } from './session';
import { audit } from '@/lib/audit/log';
import { jsonError } from '@/lib/validation/api';
import type { Role } from './rbac';

export interface PinSessionUser {
  id: string;
  organization_id: string;
  full_name: string;
  role: Role;
  email: string;
}

const limitMsg = (limit: number) =>
  `Limite d'appareils atteinte (${limit}). Un autre poste est déjà connecté : libérez-le depuis Réglages ▸ Société & boutiques ▸ Caisses, ou augmentez la limite multi-appareils.`;

/**
 * Ouvre la session POS d'un utilisateur dont le code PIN vient d'être
 * vérifié — choix manuel du profil (pin-login) OU détection automatique
 * (pin-login-auto, voir cette route) : remet son compteur d'échecs à zéro,
 * crée la session (avec le même repli « libère une session fantôme » en cas
 * de limite d'appareils atteinte), pose le cookie, journalise le succès et
 * renvoie la réponse HTTP finale.
 */
export async function openPinSession(
  user: PinSessionUser,
  ip: string | null,
  ua: string | null,
  auditAction: string,
  auditPayload: Record<string, unknown> = {},
): Promise<NextResponse> {
  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL,
                       last_login_at = now(), updated_at = now()
       WHERE id = $1`,
    [user.id],
  );

  async function openSession() {
    return createSession({
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
      ip,
      userAgent: ua,
    });
  }

  let token: string;
  try {
    token = await openSession();
  } catch (err) {
    if (err instanceof DeviceLimitError) {
      // Libère une éventuelle session caisse fantôme du même utilisateur
      // (onglet fermé sans déconnexion) puis réessaie une fois.
      const freed = await query(
        `UPDATE sessions SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
            AND COALESCE(kind, 'pos') = 'pos'`,
        [user.id],
      );
      if ((freed.rowCount ?? 0) > 0) {
        try {
          token = await openSession();
        } catch (err2) {
          if (err2 instanceof DeviceLimitError) {
            return jsonError('DEVICE_LIMIT_REACHED', 403, { limit: err2.limit, message: limitMsg(err2.limit) });
          }
          throw err2;
        }
      } else {
        return jsonError('DEVICE_LIMIT_REACHED', 403, { limit: err.limit, message: limitMsg(err.limit) });
      }
    } else {
      throw err;
    }
  }

  cookies().set({ ...sessionCookieOptions(), value: token });

  await audit({
    organizationId: user.organization_id, userId: user.id, action: auditAction,
    ip, userAgent: ua, payload: { role: user.role, ...auditPayload }, severity: 'info',
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      organization_id: user.organization_id,
    },
  });
}
