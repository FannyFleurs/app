import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { query } from '@/lib/db/client';
import type { Role } from './rbac';

const COOKIE_NAME = 'webpos_session';

function secretKey(): Uint8Array {
  const k = process.env.SESSION_SECRET;
  if (!k || k.includes('change-me')) {
    throw new Error('SESSION_SECRET non configuré');
  }
  return Buffer.from(k, 'hex');
}

// Durée de session par défaut : 30 jours. Combinée au renouvellement glissant
// (voir renewSessionFromToken + /api/auth/refresh), un appareil réellement
// utilisé reste connecté en continu ; c'est le délai d'inactivité avant qu'un
// appareil laissé fermé finisse par se déconnecter.
const DEFAULT_TTL_MIN = 60 * 24 * 30; // 30 jours

function ttlMinutes(kind: 'pos' | 'management' = 'pos'): number {
  // Les sessions de gestion (back-office / CA) peuvent avoir leur propre durée
  // via SESSION_TTL_MANAGEMENT_MINUTES ; sinon on retombe sur SESSION_TTL_MINUTES.
  const raw = kind === 'management'
    ? (process.env.SESSION_TTL_MANAGEMENT_MINUTES ?? process.env.SESSION_TTL_MINUTES)
    : process.env.SESSION_TTL_MINUTES;
  const v = Number(raw ?? String(DEFAULT_TTL_MIN));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_MIN;
}

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: Role;
}

interface SessionClaims {
  sub: string;            // user id
  org: string;            // organization id
  jti: string;            // session id
  tkh: string;            // token hash (sha256 of raw token)
  role: Role;
}

export class DeviceLimitError extends Error {
  constructor(public limit: number) {
    super(`DEVICE_LIMIT_REACHED:${limit}`);
  }
}

export async function createSession(args: {
  userId: string;
  organizationId: string;
  role: Role;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Type de session : 'pos' (poste de caisse, soumis à la limite
   * multi-appareils) ou 'management' (back-office / CA / admin, hors
   * limite). Défaut : 'pos'.
   */
  kind?: 'pos' | 'management';
  /** Durée de vie personnalisée (minutes). Ex : session PDA appairée (~1 an). */
  ttlMinutesOverride?: number;
}): Promise<string> {
  const kind = args.kind ?? 'pos';
  // Vérification de la limite multi-appareils.
  // - super_admin contourne la limite (besoin admin SaaS cross-tenant).
  // - Les sessions de gestion (bo./ca./admin) ne consomment pas de poste.
  // - Sinon : compte les sessions CAISSE actives et compare à
  //   organizations.max_devices (par défaut 1 via migration 0015).
  if (args.role !== 'super_admin' && kind === 'pos') {
    try {
      const orgRes = await query<{ max_devices: number }>(
        `SELECT COALESCE(max_devices, 1) AS max_devices
           FROM organizations WHERE id = $1`,
        [args.organizationId],
      );
      // Chaque caisse est prévue pour tourner sur son propre poste : la
      // limite de sessions simultanées est donc au moins égale au nombre
      // de caisses actives de l'organisation (le nombre de caisses est
      // déjà plafonné par l'offre). max_devices reste un plancher qu'un
      // super-admin peut relever manuellement (option multi-appareils).
      let registerCount = 0;
      try {
        const regRes = await query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM registers
            WHERE organization_id = $1 AND COALESCE(is_active, true) = true`,
          [args.organizationId],
        );
        registerCount = Number(regRes.rows[0]?.c ?? 0);
      } catch { /* table/col absente : on ignore */ }
      const limit = Math.max(Number(orgRes.rows[0]?.max_devices ?? 1), registerCount);
      const activeRes = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE u.organization_id = $1
            AND s.revoked_at IS NULL
            AND s.expires_at > now()
            AND COALESCE(s.kind, 'pos') = 'pos'`,
        [args.organizationId],
      );
      const active = Number(activeRes.rows[0]?.c ?? 0);
      if (active >= limit) {
        throw new DeviceLimitError(limit);
      }
    } catch (err) {
      if (err instanceof DeviceLimitError) throw err;
      // Migration 0015 pas appliquée ou autre erreur SQL : on ne bloque pas
      // eslint-disable-next-line no-console
      console.warn('[session] device limit check skipped:', (err as Error).message);
    }
  }

  const sessionId = crypto.randomUUID();
  const raw = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + (args.ttlMinutesOverride ?? ttlMinutes()) * 60 * 1000);

  try {
    await query(
      `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, expires_at, kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [sessionId, args.userId, tokenHash, args.ip ?? null, args.userAgent ?? null, expiresAt.toISOString(), kind],
    );
  } catch (err) {
    // Migration 0032 (colonne kind) pas encore appliquée : fallback.
    if ((err as Error).message?.includes('kind')) {
      await query(
        `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [sessionId, args.userId, tokenHash, args.ip ?? null, args.userAgent ?? null, expiresAt.toISOString()],
      );
    } else {
      throw err;
    }
  }

  const jwt = await new SignJWT({
    org: args.organizationId,
    jti: sessionId,
    tkh: tokenHash,
    role: args.role,
  } satisfies Omit<SessionClaims, 'sub'>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(args.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());

  return jwt;
}

export function sessionCookieOptions(kind: 'pos' | 'management' = 'pos') {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: ttlMinutes(kind) * 60,
  };
}

/**
 * Renouvellement glissant : prolonge une session valide (étend l'expiration en
 * base + renvoie un nouveau JWT et les options de cookie associées). Appelé par
 * /api/auth/refresh à intervalle régulier tant que l'appareil est utilisé, ce
 * qui maintient un appareil déjà connecté connecté en continu. Renvoie null si
 * la session n'est plus valide (révoquée / expirée / utilisateur désactivé).
 */
export async function renewSessionFromToken(
  token: string,
): Promise<{ token: string; cookie: ReturnType<typeof sessionCookieOptions> & { value: string } } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const claims = payload as unknown as SessionClaims;

    const res = await query<{
      revoked_at: string | null;
      expires_at: string;
      kind: string | null;
      is_active: boolean;
    }>(
      `SELECT s.revoked_at, s.expires_at, s.kind, u.is_active
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.token_hash = $2`,
      [claims.jti, claims.tkh],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0]!;
    if (row.revoked_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    if (!row.is_active) return null;

    const kind = (row.kind ?? 'pos') === 'management' ? 'management' : 'pos';
    const expiresAt = new Date(Date.now() + ttlMinutes(kind) * 60 * 1000);
    await query(
      `UPDATE sessions SET expires_at = $2 WHERE id = $1`,
      [claims.jti, expiresAt.toISOString()],
    );

    const jwt = await new SignJWT({
      org: claims.org,
      jti: claims.jti,
      tkh: claims.tkh,
      role: claims.role,
    } satisfies Omit<SessionClaims, 'sub'>)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(secretKey());

    return { token: jwt, cookie: { ...sessionCookieOptions(kind), value: jwt } };
  } catch {
    return null;
  }
}

// Mémoïsé par requête (React cache) : le layout, la page et les guards qui
// lisent la session pendant le même rendu partagent une seule requête DB.
export const readSessionFromCookie = cache(async (): Promise<AuthUser | null> => {
  const store = cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie) return null;
  return readSessionFromToken(cookie.value);
});

export async function readSessionFromToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
    });
    const claims = payload as unknown as SessionClaims;

    const res = await query<{
      id: string;
      user_id: string;
      revoked_at: string | null;
      expires_at: string;
      role: Role;
      email: string;
      full_name: string;
      organization_id: string;
      is_active: boolean;
    }>(
      `SELECT s.id, s.user_id, s.revoked_at, s.expires_at,
              u.role, u.email, u.full_name, u.organization_id, u.is_active
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.token_hash = $2`,
      [claims.jti, claims.tkh],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0]!;
    if (row.revoked_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    if (!row.is_active) return null;

    return {
      id: row.user_id,
      organizationId: row.organization_id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
    };
  } catch {
    return null;
  }
}

export async function revokeSession(token: string): Promise<void> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
    });
    const claims = payload as unknown as SessionClaims;
    await query(
      `UPDATE sessions SET revoked_at = now() WHERE id = $1`,
      [claims.jti],
    );
  } catch {
    /* silencieux */
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
