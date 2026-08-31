import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, sessionCookieOptions, DeviceLimitError } from '@/lib/auth/session';
import { audit } from '@/lib/audit/log';
import { parseJson, jsonError } from '@/lib/validation/api';

const schema = z.object({
  user_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/),
});

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { user_id, pin } = parsed.data;

  const ua = headers().get('user-agent');
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || headers().get('x-real-ip') || null;

  // Boutique du poste (via le cookie device) : sert à rattacher l'événement de
  // connexion à SA boutique dans l'historique, au lieu de le montrer partout.
  const deviceId = cookies().get('webpos_device_id')?.value ?? null;
  let deviceStoreId: string | null = null;
  if (deviceId) {
    const rReg = await query<{ store_id: string }>(
      `SELECT store_id FROM registers WHERE device_id = $1 AND is_active = TRUE LIMIT 1`,
      [deviceId],
    );
    deviceStoreId = rReg.rows[0]?.store_id ?? null;
  }

  const userRes = await query<{
    id: string;
    organization_id: string;
    pin_code_hash: string | null;
    full_name: string;
    role: 'super_admin'|'owner'|'manager'|'vendeur'|'comptable'|'lecture_seule'|'support_technique';
    is_active: boolean;
    failed_attempts: number;
    locked_until: string | null;
    email: string;
  }>(
    `SELECT id, organization_id, pin_code_hash, full_name, role,
            is_active, failed_attempts, locked_until, email
       FROM users WHERE id = $1`,
    [user_id],
  );
  const user = userRes.rows[0];
  if (!user || !user.is_active) {
    await audit({
      organizationId: null, userId: null, action: 'auth.pin_login.failed',
      ip, userAgent: ua, payload: { user_id, reason: 'unknown_user', store_id: deviceStoreId }, severity: 'security',
    });
    return jsonError('INVALID_PIN', 401);
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return jsonError('ACCOUNT_LOCKED', 423, { until: user.locked_until });
  }
  if (!user.pin_code_hash) {
    return jsonError('NO_PIN_SET', 403);
  }

  const ok = await verifyPassword(pin, user.pin_code_hash);
  if (!ok) {
    const newAttempts = user.failed_attempts + 1;
    const lockUntil =
      newAttempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null;
    await query(
      `UPDATE users SET failed_attempts = $2, locked_until = $3, updated_at = now() WHERE id = $1`,
      [user.id, newAttempts, lockUntil],
    );
    await audit({
      organizationId: user.organization_id, userId: user.id,
      action: 'auth.pin_login.failed',
      ip, userAgent: ua, payload: { attempts: newAttempts, store_id: deviceStoreId }, severity: 'security',
    });
    return jsonError('INVALID_PIN', 401);
  }

  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL,
                       last_login_at = now(), updated_at = now()
       WHERE id = $1`,
    [user.id],
  );

  const authUser = user; // capture non-null (narrowing perdu dans les closures)
  async function openSession() {
    return createSession({
      userId: authUser.id,
      organizationId: authUser.organization_id,
      role: authUser.role,
      ip,
      userAgent: ua,
    });
  }

  const limitMsg = (limit: number) =>
    `Limite d'appareils atteinte (${limit}). Un autre poste est déjà connecté : libérez-le depuis Réglages ▸ Société & boutiques ▸ Caisses, ou augmentez la limite multi-appareils.`;

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
    organizationId: user.organization_id, userId: user.id, action: 'auth.pin_login.ok',
    ip, userAgent: ua, payload: { role: user.role, store_id: deviceStoreId }, severity: 'info',
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
