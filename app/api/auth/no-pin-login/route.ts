import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { createSession, sessionCookieOptions, DeviceLimitError } from '@/lib/auth/session';
import { audit } from '@/lib/audit/log';
import { parseJson, jsonError } from '@/lib/validation/api';

/**
 * Connexion sans PIN — autorisée uniquement si l'utilisateur a explicitement
 * activé pin_required = FALSE dans sa fiche. Sinon → 403 PIN_REQUIRED.
 */
const schema = z.object({ user_id: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { user_id } = parsed.data;

  const ua = headers().get('user-agent');
  const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim()
          || headers().get('x-real-ip')
          || null;

  const userRes = await query<{
    id: string; organization_id: string; full_name: string;
    role: 'super_admin'|'owner'|'manager'|'vendeur'|'comptable'|'lecture_seule'|'support_technique';
    is_active: boolean; pin_required: boolean | null; email: string;
  }>(
    `SELECT id, organization_id, full_name, role, is_active,
            COALESCE(pin_required, TRUE) AS pin_required, email
       FROM users WHERE id = $1`,
    [user_id],
  );
  const user = userRes.rows[0];
  if (!user || !user.is_active) return jsonError('UNKNOWN_USER', 401);
  if (user.pin_required) return jsonError('PIN_REQUIRED', 403);

  let token: string;
  try {
    token = await createSession({
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
      ip,
      userAgent: ua,
    });
  } catch (err) {
    if (err instanceof DeviceLimitError) {
      return jsonError('DEVICE_LIMIT_REACHED', 403, { limit: err.limit });
    }
    throw err;
  }
  cookies().set({ ...sessionCookieOptions(), value: token });

  await audit({
    organizationId: user.organization_id, userId: user.id,
    action: 'auth.no_pin_login.ok',
    ip, userAgent: ua, payload: { role: user.role }, severity: 'info',
  });

  await query(
    `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
    [user.id],
  );

  return NextResponse.json({ ok: true });
}
