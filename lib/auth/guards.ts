import { NextResponse } from 'next/server';
import { readSessionFromCookie, type AuthUser } from './session';
import { hasPermission, type Permission } from './rbac';

/**
 * À utiliser dans les API routes : renvoie soit { user }, soit une Response 401/403.
 */
export async function requireSession(): Promise<
  { user: AuthUser } | { response: NextResponse }
> {
  const user = await readSessionFromCookie();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: 'UNAUTHENTICATED' },
        { status: 401 },
      ),
    };
  }
  return { user };
}

export async function requirePermission(
  permission: Permission,
): Promise<{ user: AuthUser } | { response: NextResponse }> {
  const r = await requireSession();
  if ('response' in r) return r;
  if (!hasPermission(r.user.role, permission)) {
    return {
      response: NextResponse.json(
        { error: 'FORBIDDEN', permission },
        { status: 403 },
      ),
    };
  }
  return { user: r.user };
}

/**
 * Garde réservée aux opérateurs SaaS de Florea POS (super_admin).
 * Permet d'accéder aux endpoints cross-tenant (/admin/*).
 */
export async function requireSuperAdmin(): Promise<
  { user: AuthUser } | { response: NextResponse }
> {
  const r = await requireSession();
  if ('response' in r) return r;
  if (r.user.role !== 'super_admin') {
    return {
      response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    };
  }
  return { user: r.user };
}
