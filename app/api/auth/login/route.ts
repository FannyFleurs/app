import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { setTenantCookie } from '@/lib/auth/tenant';
import { audit } from '@/lib/audit/log';
import { parseJson, jsonError } from '@/lib/validation/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function POST(req: Request) {
  try {
    return await handleLogin(req);
  } catch (err) {
    // Logue la stack côté serveur pour qu'un 500 ne soit jamais silencieux.
    // eslint-disable-next-line no-console
    console.error('[auth.login] uncaught error:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (err as Error).message },
      { status: 500 },
    );
  }
}

async function handleLogin(req: Request) {
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { email: rawEmail, password } = parsed.data;
  // Normalisation : email toujours en minuscules (le script create:super-admin
  // et /setup enregistrent en lowercase). La comparaison reste donc
  // case-insensitive côté serveur.
  const email = rawEmail.trim().toLowerCase();

  const ua = headers().get('user-agent');
  const ip =
    headers().get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers().get('x-real-ip') ||
    null;

  const userRes = await query<{
    id: string;
    organization_id: string;
    password_hash: string;
    full_name: string;
    role: 'super_admin'|'owner'|'manager'|'vendeur'|'comptable'|'lecture_seule'|'support_technique';
    is_active: boolean;
    failed_attempts: number;
    locked_until: string | null;
  }>(
    `SELECT id, organization_id, password_hash, full_name, role,
            is_active, failed_attempts, locked_until
       FROM users WHERE lower(email) = $1`,
    [email],
  );
  const user = userRes.rows[0];
  if (!user || !user.is_active) {
    await audit({
      organizationId: null, userId: null, action: 'auth.login.failed',
      ip, userAgent: ua, payload: { email, reason: 'unknown_user' }, severity: 'security',
    });
    return jsonError('INVALID_CREDENTIALS', 401);
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return jsonError('ACCOUNT_LOCKED', 423, { until: user.locked_until });
  }

  const ok = await verifyPassword(password, user.password_hash);
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
      organizationId: user.organization_id, userId: user.id, action: 'auth.login.failed',
      ip, userAgent: ua, payload: { attempts: newAttempts }, severity: 'security',
    });
    return jsonError('INVALID_CREDENTIALS', 401);
  }

  // Réinitialisation tentatives + last_login
  await query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL,
                       last_login_at = now(), updated_at = now()
       WHERE id = $1`,
    [user.id],
  );

  const token = await createSession({
    userId: user.id,
    organizationId: user.organization_id,
    role: user.role,
    ip,
    userAgent: ua,
  });

  cookies().set({
    ...sessionCookieOptions(),
    value: token,
  });
  // Cookie tenant : permet à l'écran PIN-login de pré-sélectionner ce
  // tenant pour les futures connexions sur ce poste.
  setTenantCookie(user.organization_id);

  await audit({
    organizationId: user.organization_id, userId: user.id, action: 'auth.login.ok',
    ip, userAgent: ua, payload: { role: user.role }, severity: 'info',
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email,
      full_name: user.full_name,
      role: user.role,
      organization_id: user.organization_id,
    },
  });
}
